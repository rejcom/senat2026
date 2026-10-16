# Sobota 17. 10.: záznam a vyhodnocení predikce 2. kola

Cíl: po sečtení mít poctivé vyhodnocení pro nedělní zpravodaj, tedy co predikce tvrdila při **5, 10, 25, 50 a 75 %** sečtených okrsků a jak to nakonec dopadlo, včetně toho, **kde jsme se mýlili**.

Web se tím nijak nemění. Oba skripty jen čtou data ČSÚ a počítají stejným kódem jako web (`src/predikce.js`).

## 1. Před 14:00: spustit záznam

Na počítači, který zůstane celé odpoledne zapnutý (vypnout uspávání), otevřete terminál ve složce projektu:

```bash
cd C:\Cursor\senat2026
node scripts/k2-zaznam.mjs
```

* Do zveřejnění první dávky jen píše „čekám na první dávku ČSÚ…“. To je v pořádku, dávky ČSÚ vydává až po 14:00.
* Pak každých 20 s stáhne nové dávky a vypíše tabulku: obvod, kolik je sečteno, odhad podílu, interval, šance na výhru a slovní výrok (stejný jako na webu).
* Ukládá do `.cache/k2-2026/`:
  * `vysledky_okrsky_NNNNN.xml`: každou dávku ČSÚ,
  * `casy.json`: kdy která dávka dorazila (kvůli časové ose ve zpravodaji),
  * `predikce.jsonl`: co predikce ukazovala po každé dávce.
* Skončí sám, až jsou všechny obvody sečtené a 30 minut nepřišla nová dávka. Ukončit jde i ručně klávesami **Ctrl+C**, nic se neztratí.
* Může běžet zároveň s vysíláním. Jde o jiný proces a ČSÚ se ptá jen každých 20 s.

**Když se něco pokazí** (restart, výpadek sítě): stačí spustit stejný příkaz znovu. Uložené dávky zůstanou, chybějící se dotáhnou. Ztratí se jen přesné časy dávek, které přišly během výpadku.

## 2. Po sečtení: vyhodnocení

```bash
node scripts/k2-vyhodnoceni.mjs
```

Trvá asi minutu. Dávky ve skutečném pořadí sčítání přehraje znovu a vytvoří složku `doc/vyhodnoceni-2kolo-2026/`:

| soubor | co v něm je |
|---|---|
| `README.md` | hotová zpráva: shrnutí v číslech, **Kde jsme se mýlili**, tabulka obvod po obvodu, časová osa |
| `chyba.svg` | graf: průměrná chyba predikce vs. prosté „dosavadní procento“ při 5, 10, 25, 50, 75 % sečteného |
| `obvody.svg` | graf: odhad při 10 % sečteného (s intervalem) vs. skutečný výsledek v každém obvodu |
| `obvody.csv` | všechna čísla pro vlastní grafy (otevřete v Excelu) |

Grafy SVG jdou otevřít v prohlížeči. Do zpravodaje na LinkedIn je nahrajte jako obrázek: v prohlížeči otevřete SVG a udělejte snímek obrazovky, nebo si řekněte o převod do PNG.

**Pojistka:** vyhodnocení funguje i bez záznamu. Když záznam v sobotu neběžel, skript si dávky stáhne od ČSÚ zpětně (ČSÚ je nechává na webu, ověřeno na 1. kole 2026 a na 2. kole 2024). Chybět bude jen časová osa.

### Milníky přímo na webu (v reálném čase)

U každého obvodu, kde je predikce vydána, je pod ní tabulka **„Jak se predikce vyvíjela“**: když se v obvodu překoná 5, 10, 25, 50 a 75 % sečtených okrsků, přibyde řádek s tím, co predikce tvrdila (s 90% intervalem) a jaká byla v tu chvíli skutečnost (dosavadní podíl z už sečtených hlasů). Po sečtení všech okrsků se doplní konečný výsledek a u každého řádku chyba predikce. Tabulka se objevuje sama s každou novou dávkou ČSÚ, nic se nespouští ručně.

Aby záznam na webu zůstal natrvalo (i kdyby ČSÚ dávky stáhl), po úplném sečtení spusťte:

```bash
node scripts/predikce-milniky.mjs
git add public/data/predikce-milniky-2kolo.json
git commit -m "Záznam milníků predikce 2. kola"
git push
```

Web pak u sečtených obvodů bere tabulku z tohoto souboru, u nedokončených dál přehrává dávky živě.

## 3. Co znamenají čísla (do zpravodaje)

* **Prosté „dosavadní procento“:** to, co ukazuje většina webů, tedy podíl z dosud sečtených hlasů. Je zkreslené, protože se nejdřív sčítají malé obce a města až nakonec.
* **Predikce (model):** z už sečtených okrsků se naučí, jak se v obvodu změnilo 1. kolo na 2. kolo, a dopočítá nesečtené okrsky podle jejich výsledku v 1. kole. Učila se na 97 druhých kolech z let 2018–2024. Podrobně v [doc/PREDIKCE.md](doc/PREDIKCE.md).
* **Průměrná chyba (RMSE):** o kolik procentních bodů se odhad konečného podílu v průměru lišil od skutečnosti. Ve zpětném testu na skutečném pořadí sčítání 2024 čekáme kolem 4,3 p. b. při 5 %, 2,5 při 10 %, 1,7 při 20 % a 0,9 při 50 %.
* **90% interval:** rozpětí, ve kterém by skutečnost měla být v 9 z 10 případů. Když vypadne ven zhruba v 1 z 10 případů, je to v pořádku. Když častěji, model byl příliš sebejistý.
* **Jistý výrok:** šance aspoň 95 % a sečteno aspoň 10 % okrsků. Při méně než 10 % sečteného ho web záměrně nevydává (zpětný test tam jednou chyboval).
* **Brierovo skóre** předběžného odhadu před hlasováním: 0 je dokonalé, 0,25 je hod mincí. Zpětný test čekal 0,154.

## 4. Kostra zpravodaje (neděle)

1. **Jak jsme predikci postavili:** princip modelu a z čeho se učila (97 druhých kol, 18 088 okrsků), zpětný test.
2. **Předběžný odhad před hlasováním:** kolik favoritů vyhrálo, kde přišlo překvapení (sekce „Shrnutí“ a „Předběžný odhad se mýlil“).
3. **Během sčítání:** graf `chyba.svg` a čísla při 5 / 10 / 25 / 50 %. Hlavní zpráva: o kolik byl model přesnější než prosté procento.
4. **Kde jsme se mýlili:** přímo ze zprávy (největší odchylky, změny favorita, výsledky mimo interval, případné chybné jisté výroky).
5. **Jak volby dopadly:** kdo vyhrál a nové složení Senátu.
6. **Co příště uděláme jinak.**
7. Krátký blok „Mezitím ve škole: Štít Arena“.

## Zkouška nanečisto (kdykoli předem)

```bash
node scripts/k2-zaznam.mjs --demo 1 --dir .cache/k2-demo
node scripts/k2-vyhodnoceni.mjs --demo --dir .cache/k2-demo --out .cache/vyhodnoceni-demo
```

Vymyšlené dávky se „sečtou“ za minutu a vznikne ukázková zpráva v `.cache/vyhodnoceni-demo/`. Před sobotou ukázkovou složku smažte, ať se nesplete se skutečností (`.cache/` není v gitu).
