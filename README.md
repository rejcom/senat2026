# Senátní volby 2026 – mapa kandidátů a výsledků

Statický web (Vite + D3), který ukazuje kandidáty do Senátu po obvodech, kdo obhajuje mandát,
a po spuštění sčítání i průběžné výsledky přímo z ČSÚ.

## Spuštění

```bash
npm install
npm run dev        # vývojový server na http://localhost:5173
npm run build      # produkční build do dist/ (funguje z libovolného podadresáře)
```

Demo výsledků před volbami (fiktivní čísla, jasně označená): `?demo=1` (první výsledky, sečteno pár % okrsků), `?demo=2` (konec 1. kola), `?demo=3` (po 2. kole).

## Grafiky a export do PNG

Tlačítko **⬇ PNG** u mapy, věkového grafu a grafu „Kdo brání, kdo útočí“ stáhne obrázek 2400×1254 px (poměr 1200×627, doporučený pro LinkedIn)
s nadpisem, klíčovými čísly a zdrojem. Grafiky: mapa, věk kandidátů, „Kdo brání, kdo útočí“ a křeslový graf **Složení Senátu**
(81 křesel podle klubů, zatržítko = mandát, o který se letos volí; po prvních výsledcích přibude pohled „Průběžné složení“). Export vždy používá světlý vzhled. U mapy s (demo) výsledky je v obrázku červený pruh „DEMO – fiktivní data“.

## Data

| Co | Odkud | Kdy se načítá |
|---|---|---|
| Kandidáti, číselníky | `volby.gov.cz/opendata/se2026` (CSV) | při `npm run data` |
| Hranice obvodů | ČSÚ geodata, vrstva `Senátní_volební_obvody_2026` | při `npm run data` |
| Obhájci mandátu | `vysledky_celk.xml` (složení Senátu) | při prvním `npm run data`, uloženo v `data-src/incumbents.json` |
| Kluby a senátoři (křeslový graf) | [senat.cz](https://www.senat.cz/organy/index.php?O=4&par_1=K) – kluby, profily senátorů (obvod, strana, konec mandátu) | při prvním `npm run data`, uloženo v `data-src/senate-clubs.json` |
| **Výsledky voleb** | `volby.gov.cz/appdata/senat/20261009/odata/vysledky.xml` | **za běhu v prohlížeči, každých 60 s** |

```bash
npm run data           # znovu stáhne registr kandidátů a hranice (nový soubor ČSÚ najde sám ze stránky opendata)
npm run data:refresh   # navíc znovu stáhne složení Senátu (obhájci)
```

Výsledky nepotřebují žádný server: ČSÚ posílá `access-control-allow-origin: *`, takže je prohlížeč čte přímo.
Interval 60 s odpovídá cache serveru ČSÚ. Když je záložka skrytá, stahování se pozastaví.
Kandidáti z XML se párují podle (obvod, pořadové číslo) a kontroluje se příjmení, cizí XML tedy nepřiřadí hlasy špatnému člověku.

**Po volbách** (9.–10. 10.) nedělejte `npm run data:refresh` ani `npm run data:senate` – zdroje by už obsahovaly nově zvolené
senátory a „před volbami“ by se přepsalo. Snímky v `data-src/incumbents.json` a `data-src/senate-clubs.json` jsou záměrně zamrzlé.
`npm run data:senate` (jen před volbami) znovu stáhne kluby ze senat.cz, pokud se mezitím někdo přesunul mezi kluby.

## Známá omezení

- **Pohlaví** není v datech ČSÚ. Odvozuje se z příjmení (-ová, -á) a křestního jména. Výjimky lze zapsat do
  `scripts/gender-overrides.json` (`{"Jméno Příjmení": "F"}`). Seznam všech odhadů je v `data-src/gender-review.txt`.
- **Obhájci mandátu** jsou určeni ze složení Senátu ke dni uvedenému v patičce webu (snímek z 18. 1. 2025).
  Pokud se od té doby v některém z 27 obvodů změnil senátor, je třeba `npm run data:refresh` (před volbami).
- Barva = **nominující strana** (`NSTRANA`). Kandidát nominovaný např. STAN může být bezpartijní.
  Strany, které nemají vlastní barvu v `src/config.js`, jsou v šedé skupině „Ostatní“.

## Struktura

```
scripts/build-data.mjs   stažení a příprava dat → public/data/*
src/live.js              parser XML výsledků, odvození stavu obvodu, poller
src/map.js               SVG mapa (D3), zoom, tečky kandidátů
src/cards.js             tooltip / detail obvodu
src/senate.js            křeslový graf Senátu (kluby, průběžné složení)
src/export.js            export grafik do PNG 1200×627
scripts/senate-clubs.mjs stažení klubů a senátorů ze senat.cz
src/demo.js              generátor fiktivního XML pro ?demo=
```
