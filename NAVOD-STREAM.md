# Návod: živé vysílání senátních voleb na LinkedIn Live

Jak pustit `vysilani.html` jako živý přenos na LinkedIn. Shrnutí: **stránka běží na jednom počítači → OBS ji zachytí (obraz i zvuk) → pošle na LinkedIn Live.**
Diváci na LinkedInu vidí a slyší video z vašeho počítače, stránku sami otevírat nemusí.

```
Edge: vysilani.html  ──►  OBS (obraz + zvuk počítače)  ──►  LinkedIn Live (naplánovaná událost)
```

> **Stav ověření.** LinkedIn (podmínky, postup s klíčem) jsou z oficiální nápovědy LinkedInu. Čísla pro kódování videa v OBS jsou obecné doporučení pro 1080p / 30 fps,
> LinkedIn je na svých stránkách výslovně neuvádí. Celý řetězec (OBS → LinkedIn) **nebyl vyzkoušen**, proto ho projděte na zkoušce (kapitola 3).

---

> **Nemůžete v ten den vysílat ze svého počítače?** Existuje varianta, kdy celé vysílání poběží na serveru (AWS) a vy ho z konference jen spustíte několika příkazy z telefonu
> nebo notebooku, bez OBS a bez plochy, kterou by šlo odpojit. Postup je v [deploy/stream/README.md](deploy/stream/README.md). Tento návod pak použijte pro zkoušku a jako záložní plán.

## 1. Co potřebujete

- **Počítač s Windows**, zapojený do sítě (ne na baterii), s **Microsoft Edge** (české hlasy bývají nejlepší v něm). Ideálně druhý monitor nebo dost velké okno.
- **Rychlý stabilní internet.** Ověřte **rychlost odesílání** (upload), např. na speedtest.net. Vysílání potřebuje asi 5–6 Mbps plynule, ideálně 8 Mbps a víc. Kabel je spolehlivější než Wi-Fi.
- **[OBS Studio](https://obsproject.com/)** (zdarma).
- **LinkedIn profil nebo stránka, která smí vysílat.** Podle [nápovědy LinkedIn](https://www.linkedin.com/help/linkedin/answer/a568503): víc než **150 sledujících či kontaktů**, účet starší než **30 dní**, bez porušování pravidel.
  **O přístup se nežádá**, oprávnění se vyhodnotí samo: při vytváření události se nabídka „Live“ ukáže, pokud podmínky splňujete.
- Na LinkedInu **nelze vysílat přímo z webu**, vždy je potřeba nástroj jako OBS.

## 2. Nejpozději týden předem

1. **Naplánujte událost na LinkedInu.** Od 22. 6. 2026 už se **nedá spustit vysílání ze dne na den**, každé musí být předem naplánované ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a554240/)).
   Vytvořte událost typu Live, dejte jí název a popis (třeba „Senátní volby 2026 živě: automatický přehled výsledků“) a začátek na **sobotu 10. 10. odpoledne** (výsledky se objeví až po zavření místností ve 14:00).
   Doporučuju začátek o půl hodiny až hodinu později než 14:00 a podle nápovědy lze začít vysílat **až 15 minut před** plánovaným časem a **až 2 hodiny po** něm, takže máte rezervu.
2. **Zveřejněte příspěvek** s odkazem na událost.
3. **Nainstalujte OBS** a nastavte ho podle kapitoly 4.
4. **Vyzkoušejte celý řetězec na simulaci** (kapitola 3). Nejdůležitější krok.
5. **Poslechněte výslovnosti stran:** `vyslovnost.html`.

## 3. Zkouška bez skutečných dat

Otevřete v Edge (celý večer se odehraje za pár minut, všechna čísla jsou fiktivní a nahoře svítí DEMO):

`https://rejcom.github.io/senat2026/vysilani.html?demo=noc&min=3&bezovladani=1`

1. Klikněte na **▶ Spustit vysílání** (nechte zaškrtnutý mluvený komentář).
2. Klávesa **F** přepne na celou obrazovku.
3. V OBS pusťte zkušební vysílání (kapitola 4) a ověřte obraz i zvuk. Doporučuju stream nahrát („Spustit nahrávání“) a poslechnout si ho.
4. Zkoušet můžete i na LinkedInu, ale **k vysílání do události dostanete klíč jen v omezeném čase před začátkem** (kapitola 5) a náhled je u neověřených účtů omezen na 10 minut. Proto si nejdřív ověřte OBS lokálním nahráním.

## 4. Nastavení OBS

Názvy podle anglického OBS (v české verzi se mohou drobně lišit).

**Video** (Settings → Video)
- Base (Canvas) Resolution: **1920×1080**, Output (Scaled) Resolution: **1920×1080** (při slabém uploadu 1280×720), FPS: **30**.

**Výstup** (Settings → Output → Output Mode: *Advanced*)
- Encoder: **NVENC** (NVIDIA) nebo **AMF** (AMD); jinak **x264**.
- Rate Control: **CBR**, Bitrate: **4500 Kbps** (při slabém uploadu **3000**), Keyframe Interval: **2 s**.
- Audio Bitrate: 160 Kbps.
- Celkový datový tok držte v rozmezí **70–80 % vašeho otestovaného uploadu**, aby video nekoktalo.

**Obraz** (v okně Sources klikněte na **+**)
- Nejjednodušší cesta: stránku pusťte na celou obrazovku (klávesa **F**) na monitoru, který OBS zachytí jako **Display Capture**.
- Bez druhého monitoru: **Window Capture** okna Edge. Okno musí mít poměr stran 16:9 (stránka se sama přizpůsobí velikosti okna).
- Vypněte „Capture Cursor“, ať v obraze není kurzor myši.
- Klávesa **Ctrl+F** v OBS roztáhne zdroj na celé plátno.

**Zvuk** (to je klíč, jinak diváci hlas neuslyší)
- Settings → Audio: **Mikrofon a Aux nastavit na „Disabled“** (mikrofon nechcete).
- Přidejte zdroj **Audio Output Capture**, vyberte zařízení, na které Edge přehrává (reproduktory nebo sluchátka).
- Během hlasového komentáře se musí hýbat ukazatel hlasitosti v OBS. Ideálně špičky kolem −12 až −6 dB.
- Vypněte všechna oznámení Windows a zavřete programy, které pípají, **všechen zvuk počítače půjde do přenosu**.

**Vysílání** (Settings → Stream)
- Service: **Custom…**, Server a Stream Key doplníte z LinkedInu (kapitola 5).
- **Stream Key je jako heslo.** Nikomu ho neposílejte, nedávejte do snímku obrazovky ani do příspěvku.

## 5. Vysílání na LinkedIn (krok za krokem)

Podle [oficiálního postupu LinkedInu](https://www.linkedin.com/help/linkedin/answer/a564446/go-live-using-a-custom-stream-rtmp-?lang=en):

1. Otevřete **Live Studio → Manage stream** a najděte svou událost.
2. **„Prepare to go live“** se rozklikne až **2 hodiny** před začátkem u ověřených stránek, u ostatních profilů a stránek jen **1 hodinu** před začátkem.
3. Na záložce **Stream settings** vyberte **region** a klikněte na **Get URL**. Dostanete **Stream URL** a **Stream Key**.
4. Vložte je do OBS (Settings → Stream) a v OBS klikněte na **Start Streaming**.
5. V LinkedInu se objeví náhled. Zkontrolujte **obraz i zvuk**. Vysílat můžete **od 15 minut před plánovaným začátkem až do 2 hodin po něm**.
6. Ve chvíli, kdy chcete jít živě, klikněte na LinkedInu na **Go live**.
7. Na konci klikněte v LinkedInu na **End Stream** a pak zastavte vysílání v OBS.

## 6. Den voleb: časový postup

| Kdy | Co |
|---|---|
| **den předem** | Počítač zapojený do sítě, vypnout spánek a automatické aktualizace, vypnout oznámení, test uploadu. Stránku jednou otevřít s `&reset=1` (smaže případnou starou paměť). |
| **T − 2 h / 1 h** | Získat Stream URL a klíč, vložit do OBS. |
| **T − 30 min** | Otevřít vysílání: `https://rejcom.github.io/senat2026/vysilani.html?bezovladani=1` (u prvního spuštění navíc `&reset=1`). Kliknout na Spustit, klávesa **F**. |
| **T − 15 min** | Start Streaming v OBS, kontrola obrazu a zvuku v náhledu LinkedInu. Do výsledků stránka čte kandidáty a hlásí „Čekáme na první výsledky“. |
| **T** | **Go live.** |
| **po 14:00** | Zavírají se místnosti, ČSÚ postupně zveřejňuje výsledky. Prvních ~15 minut sledujte, jestli komentář sedí (první skutečná data). |

Adresy:
- Ostré vysílání: `https://rejcom.github.io/senat2026/vysilani.html?bezovladani=1`
- Zkouška: `…/vysilani.html?demo=noc&min=3&bezovladani=1`
- Výslovnost stran: `…/vyslovnost.html`

## 7. Během vysílání

- **V hlavičce vpravo nahoře** vidíte stav: „Živě · data ČSÚ z 17:32“. Žlutý pruh znamená výpadek dat nebo spojení, stránka drží poslední známý stav a zkouší dál.
- **Ovládání** (na streamovacím počítači): mezerník = pauza, → = další obvod, **M** = hlas vypnout / zapnout.
- **Kontrola streamu:** dívejte se na **LinkedIn Live** (má zpoždění desítky sekund) nebo na náhled v OBS. **Druhou kopii stránky na jiném počítači nesledujte**, střídá obvody jinak než stream a mohla by vám číst.
- **Na streamovacím počítači neotevírejte druhou kopii vysílání ve stejném prohlížeči.** Sdílejí si paměť „co už zaznělo“.

## 8. Když se něco pokazí

| Problém | Řešení |
|---|---|
| Spadl prohlížeč nebo se stránka obnovila | Znovu otevřít **stejnou adresu bez `reset`**. Vysílání navazuje: řekne „Vysílání pokračuje“, znovu neoznamuje, co už zaznělo, a dohlásí zbytek. |
| Spadl OBS | Spustit OBS a znovu **Start Streaming**. Případně znovu **Go live**. |
| Nemluví hlas | Klávesa **M**. Zkontrolujte českou hlasovou volbu v Edge (`vyslovnost.html`) a zdroj „Audio Output Capture“ v OBS. |
| Nejde zvuk do přenosu | Špatné zařízení v „Audio Output Capture“, nebo zvuk hraje jinam. |
| Výpadek internetu | Stránka drží poslední stav a po obnovení spojení pokračuje. Přenos na LinkedIn se přeruší a může být nutné znovu spustit stream. |
| ČSÚ dlouho nic nezveřejní | Žlutý pruh „ČSÚ naposledy zveřejnil data v…“, počkat. |
| Špatná výslovnost strany | Přepsat řádek v `src/pronunciation.js` (viz README), po nasazení znovu načíst. |
| Nejde volba „Live“ na LinkedInu | Účet nesplňuje podmínky (150+ sledujících, 30 dní). Zkontrolujte kapitolu 1. |

## 9. Co nevím

- **Maximální délku jednoho vysílání** LinkedIn na dostupných stránkách neuvádí. Noc voleb může trvat hodiny, počítejte s tím, že bude možná nutné vysílání ukončit a navázat novým. Paměť vysílání to zvládne (nezopakuje už zaznělé).
- **Kódovací čísla v OBS** jsou obecné doporučení, LinkedInova stránka je výslovně neuvádí.
- **Skutečná data ČSÚ s hlasy** jsem neviděl, protože ještě neexistují. Komentář jsem ověřil na simulaci.
- **Jestli LinkedIn Live vyžaduje ověřenou stránku** pro delší náhled: u neověřených účtů je náhled 10 minut, u ověřených stránek až 2 hodiny.

## Alternativa: StreamYard (jednodušší, ale s omezeními tarifu)

Místo OBS lze použít [StreamYard](https://streamyard.com/) (v prohlížeči, LinkedIn je jeho oficiální partner). Sdílíte **záložku prohlížeče se zvukem** (v Chrome a Edge při sdílení karty zaškrtnout „Sdílet zvuk karty“).
Bez instalace a nastavování kódování, ale zkontrolujte limity a značku bezplatného tarifu.

## 10. Propagace a organizace události

Doporučení z [LinkedIn Events: Getting started](https://business.linkedin.com/advertise/linkedin-events/getting-started) (obecný návod pro firemní stránky, technické údaje v něm nejsou)
a jak je použít pro naši událost. Části označené „návrh“ jsou moje doporučení, ne pravidla LinkedInu.

**Před událostí**
- LinkedIn radí založit událost **aspoň 2–4 týdny předem** a **hned rozeslat aspoň 10 pozvánek** do sítě. Na to je nejvyšší čas.
- **Reklama na událost (Event Ads)** je placená a nepovinná. Bez ní se dá fungovat.
- Návrh: 3–4 krátké příspěvky do události s grafikami z tlačítek ⬇ PNG: „Kdo brání, kdo útočí“, křeslový graf Senátu, věk kandidátů.
  Týden před volbami ukázka simulace (`?demo=noc`) jako video se zvukem, zřetelně označená **DEMO – fiktivní data**. Den předem připomínka „zítra ve 14:15“.
- Návrh: nepublikujte před koncem hlasování (sobota 14:00) nic, co by se dalo číst jako výsledky nebo odhad výsledků. Vše z dema musí nést nápis DEMO.

**Během události**
- LinkedIn doporučuje, aby **moderátoři odpovídali na otázky diváků**. Naše vysílání je automatické a komentáře nečte, proto je dobré mít **jednoho člověka**, který sleduje komentáře a odpovídá.
- Návrh: hned po zahájení připnout komentář s odkazem na interaktivní mapu (`https://rejcom.github.io/senat2026/`) a zdrojem dat (volby.gov.cz).
- LinkedIn doporučuje vysílat **déle než 15 minut**, aby se publikum rozrostlo, a **končit po 1–2 hodinách**, aby diváci neodpadali. Noc voleb může být delší. Návrh: hlavní blok počítejte na 1–2 hodiny
  a vysílání rozumně ukončete po závěrečném shrnutí.

**Po události**
- Záznam využijte znovu jako příspěvek nebo video. Návrh: hned po skončení příspěvek s finální mapou a křeslovým grafem (PNG z webu), s poděkováním a odkazem na záznam.
- Druhé kolo (16.–17. 10.) potřebuje **vlastní naplánovanou událost**.

## Zdroje

- [LinkedIn Help: přístupová kritéria pro LinkedIn Live](https://www.linkedin.com/help/linkedin/answer/a568503)
- [LinkedIn Help: vysílání vlastním streamem (RTMP)](https://www.linkedin.com/help/linkedin/answer/a564446/go-live-using-a-custom-stream-rtmp-?lang=en)
- [LinkedIn Help: přehled LinkedIn Live](https://www.linkedin.com/help/linkedin/answer/a554240/)
- [LinkedIn Events: Getting started](https://business.linkedin.com/advertise/linkedin-events/getting-started)
