# Predikce 2. kola senátních voleb

Průběžný statistický odhad konečného výsledku v obvodech, kde se hlasuje ve 2. kole (16.–17. 10. 2026). Zveřejňuje se, jakmile je v obvodu sečteno **aspoň 5 % okrsků** (a aspoň 5 okrsků), a zpřesňuje se s každou novou dávkou okrskových výsledků ČSÚ (obvykle po pár minutách).

Není to oficiální výsledek. Na webu a ve vysílání je to vždy označeno jako „statistický odhad“.

## Doporučení

**Použít model `base`** (hřebenová bayesovská logistická regrese, viz níže) s nastavením v `src/predict.js`.
Jednodušší `simple` je skoro stejně dobrý, ale `base` měl v testech ve všech scénářích o něco nižší chybu při skutečném pořadí sčítání a nejméně chybných „jistých“ výroků. Přidané vstupy (podíl kandidáta, účast v 1. kole, přenos odchylky v rámci obce) přesnost nezlepšily, proto se nepoužívají.

## Jak model funguje

Na webu vidíme pro každý okrsek obvodu výsledek 1. kola (všech kandidátů) a počet voličů v seznamu. Když ČSÚ zveřejní první okrsky 2. kola, model:

1. z **už sečtených** okrsků zjistí, jak se v tomto obvodu z 1. kola stalo 2. kolo (logistická regrese podílu hlasů kandidáta A na vstupech: logit podílu A:B v 1. kole, podíl ostatních kandidátů, velikost okrsku),
2. totéž aplikuje na **zatím nesečtené** okrsky, kde výsledek 1. kola známe,
3. odhadne i **počet hlasů** ve 2. kole (ve 2. kole hlasuje jen ~46 % lidí z 1. kola, zjistí se z dat),
4. nejistotu spočítá simulací (800 losování): nejistota parametrů regrese, náhodný rozptyl okrsků a společná odchylka všech nesečtených okrsků.

Výstup: odhad podílu, 90% interval, pravděpodobnost výhry a sečtené okrsky.

Proč je to lepší než „přepočítat sečtené hlasy“: okrsky se nesčítají v náhodném pořadí (nejdřív malé obce, velká města nakonec), takže prosté dosavadní procento bývá zkreslené. Model zkreslení opravuje, protože u nesečtených okrsků zná jejich 1. kolo. Je to stejný princip jako u predikcí Seznam Zpráv a MFF UK / iROZHLAS (rok 2023).

Apriorní hodnoty parametrů se naučily z historie (97 druhých kol 2018–2024, 18 088 okrsků): vliv 1. kola je slabší než 1:1 (koeficient 0,70), vedoucí z 1. kola má ve 2. kole malou výhodu a ve 2. kole hlasuje asi 46 % lidí z 1. kola (log-poměr −0,77). Při několika sečtených okrscích model drží blízko těchto hodnot, s rostoucím počtem se řídí daty z obvodu (bayesovsky).

## Zpětný test

Zpětně na všech 97 druhých kolech z let 2018, 2020, 2022 a 2024. Vždy se apriorní hodnoty naučily z ostatních tří let a testovalo se na vynechaném roce (nikdy na datech, ze kterých se učilo). Pořadí sčítání:
* **náhodné** a **malé okrsky dřív** (simulace),
* **skutečné pořadí z roku 2024** (dávky ČSÚ, jen 22 obvodů, nejvěrohodnější scénář).

Chyba odhadu konečného podílu kandidáta (procentní body, RMSE):

| sečteno | 5 % | 10 % | 20 % | 35 % | 50 % |
|---|---|---|---|---|---|
| prosté přepočítání (naive), skutečné pořadí | 7,5 | 5,8 | 4,0 | 2,9 | 2,3 |
| **model `base`, skutečné pořadí** | **4,3** | **2,5** | **1,7** | **1,0** | **0,9** |
| prosté přepočítání, „malé okrsky dřív“ | 7,5 | 5,2 | 3,9 | 3,1 | 2,4 |
| **model `base`, „malé okrsky dřív“** | **4,8** | **3,4** | **2,1** | **1,7** | **1,3** |
| prosté přepočítání, náhodné pořadí | 4,5 | 3,2 | 2,0 | 1,3 | 1,0 |
| **model `base`, náhodné pořadí** | **2,8** | **1,9** | **1,3** | **1,0** | **0,7** |

Spolehlivost 90% intervalů (podíl případů, kdy skutečnost v intervalu ležela; ideál je 90 %): model 91–100 %, prosté přepočítání jen 41–62 %.

Chybné „jisté“ výroky (pravděpodobnost nad 95 %, zjištěno při 5 / 10 / 20 / 35 / 50 % sečteného): model `base` 0/68, 0/75, 0/79, 0/84, 0/88 při náhodném pořadí, 0/50 … 0/84 při malých okrscích dřív, 1/17 … 0/22 při skutečném pořadí (jediná chyba při 5 % sečteného). Prosté přepočítání se mýlilo až u 10 z 77 jistých výroků.

Z toho plyne pojistka (v kódu `verdict` v `src/predikce.js`): dokud je sečteno méně než 10 % okrsků, výrok se nikdy neoznačí jako „téměř jistý“ ani „velmi pravděpodobný“.

Nastavení nejistoty (`sharedSd` 0,06, `covInflate` 1,25) se ladilo na mřížce hodnot tak, aby intervaly pokrývaly ~90 % případů a spíše o trochu víc než míň.

**Zkouška modulu na skutečných dávkách ČSÚ z 2. kola 2024** (`scripts/test-replay-2024.mjs`): po čtvrtině dávek měl odhad pro všech 22 obvodů chybu 0,9 p. b., 21 jistých výroků ze 21 správně, po polovině 0,3 p. b.

## Omezení a co není ověřené

* Predikce předpokládá, že se 2. kolo chová podobně jako historická 2. kola. Neobvyklá situace (silná kampaň těsně před volbou, výrazná změna účasti) může být horší, než historie naznačuje, a model to pozná až z dat obvodu.
* Zpětný test je na 97 obvodech. Skutečné pořadí sčítání máme jen z 22 obvodů z roku 2024; u starších voleb se simuluje.
* Pracuje s dvojicí postupujících kandidátů. Číslo kandidáta ve 2. kole je stejné jako v 1. kole (ověřeno na 2024).
* Okrsky, které se mezi koly sloučily nebo rozdělily, se při odhadu přeskočí (v historii méně než 1 %).
* **Nejde otestovat na ostrých datech 2. kola 2026 před 16. 10.** Celý řetězec (stažení dávek, predikce, panel, vysílání) se zkouší na demu: `index.html?demo=2&kolo2=3` a `vysilani.html?demo=2&kolo2=3&autostart=1` (dávky se vymyslí podle okrskových výsledků 1. kola a „sečtou“ se za 3 minuty).

## Provoz a data

* `npm run data:okrsky` – stáhne okrskové výsledky 1. kola 2026 (`public/data/okrsky-k1.json`, hotovo, 5 021 okrsků). Spouští se jen při opravě dat.
* Za provozu každý návštěvník stránky stahuje dávky `…/appdata/senat/20261009/odata/okrsky/K2/vysledky_okrsky_NNNNN.xml` (ČSÚ je vydává přírůstkově, v řádu minut) a predikci počítá v prohlížeči. Stejná logika běží ve vysílání (`vysilani.html`).
* `npm run predikce:lab` – znovu spustí zpětný test. První spuštění stáhne archivy ČSÚ do `.cache/` (není v gitu).
* Zveřejňovat se smí až po skončení hlasování (17. 10. ve 14:00), což zajistí to, že ČSÚ okrskové dávky vydává až po uzavření volebních místností. Stránka jen zobrazuje data ČSÚ.

## Soubory

| soubor | účel |
|---|---|
| `src/predict.js` | jádro modelu (čistá funkce, běží v prohlížeči i v Node) |
| `src/predikce.js` | živé dávky ČSÚ, spojení dat 1. a 2. kola, pravidlo „od 5 %“, slovní zařazení |
| `src/demo-k2.js` | vymyšlená 2. kola pro zkoušku |
| `src/main.js` (`renderPredikce`) | panel na hlavní stránce |
| `src/vysilani.js` (`nextPredictionSlot`) | predikce ve vysílání a komentář |
| `src/commentary.js` (`commentPrediction`) | šablony textu a hlasu |
| `scripts/predikce-lab.mjs` | zpětný test a porovnání modelů |
| `scripts/test-replay-2024.mjs` | zkouška na skutečných dávkách ČSÚ 2024 |
| `scripts/build-okrsky-k1.mjs` | okrskové výsledky 1. kola 2026 |
