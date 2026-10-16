# Podklady pro zpravodaj „Volební statistika do morku kostí“

Pracovní sbírka faktů k technickému zpravodaji o senátních volbách 2026. Všechno v části A–F je ověřené z kódu a z dokumentace v repozitáři. Část G se doplní v sobotu večer až po sečtení. Co nevím nebo jsem neověřil, je označeno **[neověřeno]**.

Web: https://rejcom.github.io/senat2026/ · repozitář: https://github.com/rejcom/senat2026

---

## A. Co to je, v kostce

- Webová aplikace pro senátní volby 2026 (1. kolo 9.–10. 10., 2. kolo 16.–17. 10.): mapa 27 obvodů, kandidáti, živé výsledky z ČSÚ, predikce 2. kola, vysílání s komentářem, a navíc stránky k zastupitelstvům (radnice.html) a okresním a krajským městům (mesta.html).
- Žádný vlastní server s databází. Je to statický web (Vite, vanilla JavaScript, ~5 100 řádků v `src/`), který si výsledky tahá přímo z ČSÚ ve vašem prohlížeči.
- Hlavní stránka po 1. kole ukazuje: zvolené už v 1. kole (Děčín, Trutnov, Rychnov nad Kněžnou, Strakonice, Vyškov), postupující do 2. kola (22 obvodů), predikci a mapu.

## B. Odkud jsou data

| co | zdroj | jak se načítá |
|---|---|---|
| kandidáti, strany, číselníky | otevřená data ČSÚ (CSV v ZIP, kódování cp1250) `volby.gov.cz/opendata/se2026/` | skript `scripts/build-data.mjs` při sestavení, výsledek je `public/data/candidates.json` |
| hranice obvodů | ČSÚ geodata, ArcGIS FeatureServer „Senátní volební obvody 2026“, výstup GeoJSON (zjednodušený, `maxAllowableOffset=0.001`) | `public/data/obvody.geojson` (~600 kB) |
| živé výsledky | `volby.gov.cz/appdata/senat/20261009/odata/vysledky.xml` | prohlížeč návštěvníka stahuje každých 60 s přímo z ČSÚ (server posílá CORS `*`) |
| okrskové výsledky 1. kola | `…/odata/okrsky/K1/vysledky_okrsky_NNNNN.xml` | skript `build-okrsky-k1.mjs` → `public/data/okrsky-k1.json` (5 021 okrsků, 247 kB) |
| okrskové výsledky 2. kola | `…/odata/okrsky/K2/vysledky_okrsky_NNNNN.xml` | prohlížeč, přírůstkové dávky po pár minutách |
| historie pro učení modelu | archivy ČSÚ 2018, 2020, 2022, 2024 (CSV v ZIP, 1. i 2. kolo po okrscích) | skript `predikce-lab.mjs` |
| složení Senátu, kluby | senat.cz | `scripts/senate-clubs.mjs` |
| souřadnice měst | Wikidata (vlastnost P782 a spol., SPARQL) | `build-kv-mesta.mjs` |
| obecní volby (zastupitelstva) | `volby.gov.cz/opendata/kv2026/` a `kv2022/`, výsledky `…/appdata/kv2026/…/odata/zastup/vysledky_obec_<kód>.xml` | prohlížeč za běhu |

Poznámky, které stojí za zmínku:
- ČSÚ vydává okrskové dávky 2. kola **přírůstkově** (čísla dávek 1, 2, 3 …) až po zavření volebních místností. Ověřeno na dávkách z 2. kola 2024: ČSÚ je drží dostupné roky.
- WAF ČSÚ blokuje prohlížeč bez normálního User-Agentu (při testech v headless Chromiu jsme dostávali chybu, vypadalo to jako CORS). V reálném prohlížeči to funguje. Poučení: při automatických testech musí být UA běžný.
- Název ZIP souboru s registrem se na stránce ČSÚ mění, proto skript název hledá dynamicky.

## C. Mapa a vizualizace

- Mapa je SVG kreslené knihovnou **d3-geo** (projekce Mercator), zoom a posun **d3-zoom**, žádné dlaždice ani Google/Leaflet. Obvody jsou polygony z GeoJSON ČSÚ.
- Barvy podle režimů: obhájce mandátu, vedoucí/zvolený, počet kandidátů, průměrný věk. Po 1. kole mapa ukazuje jen postupující a u už zvolených obarví obvod barvou strany se zlatým okrajem a jménem vítěze.
- Praha má vlastní přiblížení (obvody 21–27).
- Grafy a export: každý graf jde stáhnout jako PNG 1200×627 (formát pro LinkedIn).
- Mapa měst (mesta.html) používá souřadnice z Wikidat.
- Chyba, na které se dá ukázat: kvůli `overflow: visible` na SVG mapy obcí se do grafiky „vylila“ celá republika, opraveno ořezem a okrajem 110 (commit e10d7a1).

## D. Predikce 2. kola: jak model vznikl

Podrobně je to v `doc/PREDIKCE.md`. Tady hlavní myšlenky a čísla.

**Problém.** ČSÚ sčítá okrsky postupně a nejdřív malé obce. Prosté přepočítání „kolik % má kdo z už sečtených hlasů“ proto bývá zkreslené (velká města jdou nakonec).

**Princip.** Pro každý obvod jsou dva kandidáti A (vedoucí z 1. kola) a B. Víme výsledek 1. kola v každém okrsku. Když dorazí první okrsky 2. kola, model se z nich naučí, jak se v tomto obvodu z 1. kola stalo 2. kolo, a to aplikuje na zatím nesečtené okrsky.

**Model (`src/predict.js`).**
- Hřebenová bayesovská logistická regrese (IRLS) podílu hlasů A na okrsek. Vstupy: konstanta, logit podílu A:B v 1. kole, podíl ostatních kandidátů, vycentrovaný logaritmus velikosti okrsku.
- Kvazi-binomický rozptyl (okrsky jsou rozptýlenější, než by říkalo binomické rozdělení).
- Druhý model pro **počet hlasů**: log(V2/N1) = δ + γ·velikost. Ve 2. kole hlasuje jen asi 46 % lidí z 1. kola (δ ≈ −0,77).
- Nejistota simulací Monte Carlo, 800 losování: nejistota koeficientů, náhodný rozptyl okrsků a **společná odchylka** všech nesečtených okrsků (`sharedSd` 0,06, `covInflate` 1,25).
- Výstup: odhad podílu, 90% interval, pravděpodobnost výhry.

**Čím se „trénoval“.** Apriorní hodnoty parametrů jsou naučené z historie: **97 druhých kol z let 2018–2024, 18 088 okrsků**. Z toho například: vliv 1. kola je slabší než 1:1 (koeficient 0,70), vedoucí z 1. kola má malou výhodu, ve 2. kole hlasuje ~46 % lidí z 1. kola. S rostoucím počtem sečtených okrsků se model řídí víc daty z obvodu než apriorními hodnotami (bayesovsky).

**Jak se testoval.** Leave-one-year-out: vždy se model naučil ze tří let a testoval se na čtvrtém. Tři scénáře pořadí sčítání (náhodné, malé okrsky dřív, skutečné pořadí z 2024).

Chyba odhadu konečného podílu (RMSE, procentní body), skutečné pořadí z 2024:

| sečteno | 5 % | 10 % | 20 % | 35 % | 50 % |
|---|---|---|---|---|---|
| prosté přepočítání | 7,5 | 5,8 | 4,0 | 2,9 | 2,3 |
| náš model | 4,3 | 2,5 | 1,7 | 1,0 | 0,9 |

Spolehlivost 90% intervalů: model 91–100 %, prosté přepočítání 41–62 %. Chybné „jisté“ výroky (nad 95 %): 0 z 68 až 0 z 88 při náhodném pořadí, jediná chyba v testu při skutečném pořadí a 5 % sečteného (1 z 17).

**Pojistka.** Dokud je sečteno méně než 10 % okrsků, výrok se nikdy neoznačí „téměř jistý“ ani „velmi pravděpodobný“. Zveřejňuje se až od 5 % okrsků a aspoň 5 okrsků.

**Předběžný odhad před hlasováním** (jen z náskoku v 1. kole): `logit = −0,11 + 0,225 × náskok_v_p.b.`, ořezáno na 3–97 %. Zpětný test: Brier 0,154 (základní hodnota „vedoucí vyhraje“ 0,176), trefa vítěze 75 %. Kalibrace: odhad 52 % → skutečně 59 %, 70 → 72, 94 → 90. Před hlasováním je nejistota velká: chyba odhadu podílu okrskovým modelem je zhruba 9,6 p. b., proto se ukazuje jen pravděpodobnost, ne podíl.

**Zmrazený odhad před sčítáním** (`doc/zaznam-predikce/pred-2-kolem.md`, commit před sobotním 14:00): očekávaných 17,9 výher vedoucího z 22 obvodů. Nejtěsnější: Přerov 52 %, Kladno 55 %, Žďár 58 %, Frýdek-Místek 60 %, Česká Lípa 61 %.

**Zkouška na skutečných dávkách 2024:** po čtvrtině dávek chyba 0,9 p. b. u všech 22 obvodů, 21 jistých výroků z 21 správně; po polovině 0,3 p. b.

### Kde jsme si při stavbě sami vyrobili chybu (použitelné jako „přiznané omyly“)

1. **První nastavení bylo špatně.** Apriorní hodnota účasti byla −0,25, skutečná z dat vyšla −0,77. A koeficient 1. kola jsem původně dal 1, správně vyšlo 0,7. Opraveno přefitováním z historie.
2. **První intervaly byly příliš úzké.** Zpětný test ukázal pokrytí pod 90 %. Přidali jsme společnou odchylku a nafouknutí kovariance a ladili je na mřížce tak, aby pokrytí bylo kolem 90 % a spíše o trochu víc.
3. **Při 5 % sečteného se „jisté“ výroky mýlily.** Proto pojistka pod 10 %.
4. **Zbytečně složitější vstupy nepomohly.** Podíl kandidáta, účast v 1. kole a přenos odchylky v rámci obce přesnost nezlepšily, proto je v modelu nemáme.
5. **Jednoduchý model (`simple`) byl skoro stejně dobrý.** Vybrali jsme `base`, protože měl o něco nižší chybu při skutečném pořadí a nejméně chybných jistých výroků.

## E. Co model neumí (poctivě)

- Předpokládá, že se 2. kolo chová jako historická 2. kola. Silná kampaň těsně před volbou nebo neobvyklá změna účasti ho zaskočí a pozná to až z dat obvodu.
- Zpětný test je na 97 obvodech, skutečné pořadí sčítání máme jen z 22 obvodů (2024), u starších voleb se simuluje.
- Okrsky sloučené nebo rozdělené mezi koly se přeskakují (v historii méně než 1 %).
- Nešlo ho předem otestovat na ostrých datech 2. kola 2026. Celý řetězec jsme zkoušeli na vymyšleném demu (`?demo=2&kolo2=N`), jehož výsledky ale generuje podobný vzorec jako model. **Demo tedy neprokazuje přesnost, jen to, že kód běží.**
- Před zveřejněním výsledky nikdo neviděl: dávky vydává ČSÚ až po zavření volebních místností.

## F. Jak je to nasazené

- **Web:** GitHub Pages. Po každém pushi do větve `main` spustí GitHub Actions (`.github/workflows`) sestavení (Node 22, `npm ci`, `vite build`) a nasazení. Trvá zhruba pár minut.
- **Žádný backend.** Každý návštěvník si stahuje data z ČSÚ sám a predikci počítá ve svém prohlížeči (Monte Carlo 800 losování je rychlé). Výhoda: nic neumí spadnout na našem serveru. Nevýhoda: počítá se u každého zvlášť a při velké návštěvnosti jde o zátěž pro ČSÚ, ne pro nás.
- **Automatické obnovení:** výsledky každých 60 s (ČSÚ je samo generuje s 60 s cache). Dávky okrsků se dotahují při každém obnovení.
- **Vysílání (vysilani.html):** komentář se skládá ze šablon bez AI (z čísel), s českým hlasem (Piper nebo Azure TTS, hlas „Vlasta“) a značkami výslovnosti. Je připravený i kontejner pro server (Docker: Xvfb + Chromium + ffmpeg → RTMP) na AWS EC2, ale **živý přenos teď nepoužíváme**, jde jen o web. Stav ověření je v `deploy/stream/README.md`: ověřeno lokálně, na ostrém LinkedIn Live **[částečně neověřeno]**.
- **Poznámka k tajemstvím:** klíče (Azure, stream key) nejsou v repozitáři.

## G. Doplnit v sobotu večer (po sečtení)

Postup, až bude 2. kolo sečtené:

1. Z konzole spustit: `npm run predikce:milniky` (uloží milníky do `public/data/predikce-milniky-2kolo.json`), potom commit a push (řekni „pushni to“).
2. Volitelně `node scripts/k2-vyhodnoceni.mjs` (vyhodnocení z druhé relace, viz `NAVOD-VYHODNOCENI.md`).
3. Vyplnit tabulku níže z karty „Jak přesná predikce byla“ na hlavní stránce (počítá se sama).

| otázka | odpověď |
|---|---|
| Kolik obvodů vyhrál vedoucí z 1. kola (čekali jsme 17,9 z 22) | |
| Které obvody byly překvapení (vyhrál vyzyvatel) | |
| Brierovo skóre předběžného odhadu (zpětný test čekal 0,154) | |
| Průměrná chyba predikce při 5 / 10 / 25 / 50 / 75 % (naše vs. prosté procento) | |
| Kolik konečných výsledků leželo v 90% intervalu (čekáme ~90 %) | |
| Kolik „jistých“ výroků bylo chybných | |
| Který obvod jsme odhadli nejhůř a proč | |
| Kdy poprvé zveřejněna první predikce a kolik obvodů mělo 5 % | |
| Počet návštěv webu | nelze zjistit: žádné počítadlo není nastavené a GitHub Pages návštěvnost neukazuje |

Návrh osnovy zpravodaje:
1. Proč to děláme a co je jinak než „dosavadní procento“ (příběh o pořadí sčítání).
2. Data: odkud, jak se načítají, jak se nasazuje.
3. Mapa: bez dlaždic, d3-geo, zdroj hranic.
4. Model: princip, čím se učil (97 voleb), jak se testoval.
5. Předvolební odhad (zmrazený před sčítáním) a jak dopadl.
6. Milníky 5 / 10 / 25 / 50 / 75 %: tabulka naše predikce vs. skutečnost.
7. Kde jsme se mýlili (z karty na webu + část D „omyly při stavbě“).
8. Co bychom příště udělali jinak.

## H. Soubory, na které se odkazovat

| soubor | co |
|---|---|
| `doc/PREDIKCE.md` | postup a zpětný test modelu |
| `doc/zaznam-predikce/pred-2-kolem.md` / `.json` | zmrazený předvolební odhad |
| `src/predict.js` | jádro modelu |
| `src/predikce.js` | živé dávky ČSÚ, milníky |
| `scripts/predikce-lab.mjs` | zpětný test |
| `scripts/predikce-milniky.mjs` | trvalé uložení milníků |
| `scripts/test-replay-2024.mjs` | zkouška na skutečných dávkách 2024 |
| `deploy/stream/README.md` | vysílací kontejner a jeho stav ověření |
