# Checklist: vysílání ze serveru v den voleb

Termíny: volby **pá 9. 10. (14–22 h)** a **so 10. 10. (8–14 h)**, výsledky se smějí zveřejnit až **po 14:00 v sobotu**, událost na LinkedInu **so 10. 10. 14:15**.
Server: AWS EC2 `senat-stream` (Stockholm, `m7i-flex.large`), hlas Azure Neural `cs-CZ-VlastaNeural`.
Příkazy se spouštějí ve složce `~/senat2026/deploy/stream` a vždy jako `bash stream.sh …`.

## Co je ověřené a co ne

- Ověřeno (zkouška na YouTube, 38 minut): obraz 1080p30 ze serveru, `speed=1x` na 2 vCPU, hlas Azure, žádné chyby přenosu, zastavení příkazem `stop`.
- Ověřeno i na **LinkedIn Live v režimu ukázky**: obraz i zvuk z AWS serveru se objevily v náhledu studia (ukázka trvá 10 minut a divákům se nevysílá).
- **Neověřeno:** skutečné **Spustit živě** divákům, běh několik hodin v kuse a chování při skutečných datech ČSÚ. Proto kontrola a zkouška níže nejsou volitelné.

---

## A. Nejpozději týden předem (do 3. 10.)

- [ ] **Zkušební událost na LinkedInu** (jen pro pár lidí, jiný název). Klíč a URL se ukážou asi hodinu před začátkem.
- [ ] Na serveru: `git pull && bash stream.sh up`.
- [ ] V `.env` nastavit **ostré** vysílání (viz kapitola E), klíč z LinkedInu zadat přes `key.tmp` (viz kapitola D).
- [ ] Zkouška aspoň 30 minut: `bash stream.sh status` (řádek `speed=` kolem `1.0x`, chyby 0), náhled ve studiu LinkedIn Live, **poslech zvuku**.
- [ ] Ověřit, že v `.env` **není** `demo=`. Ve zkoušce s demem je na obrazu štítek DEMO, v ostrém vysílání by mělo zmizet.
- [ ] Vyzkoušet pád: `docker compose exec stream pkill chromium`. Do několika sekund se má prohlížeč vrátit a vysílání pokračovat.
- [ ] **Obnovit klíče**, které někdy prošly chatem: klíč Azure Speech a klíče YouTube. Nový Azure klíč do `.env`.
- [ ] Ověřit v AWS, že jsou na účtu kredity (Billing) a že `m7i-flex.large` jde spustit.
- [ ] Záložní plán: kolega s notebookem a OBS podle [NAVOD-STREAM.md](../../NAVOD-STREAM.md).

## B. Čtvrtek/pátek (7. až 9. 10.)

- [ ] Spustit instanci (EC2 → Instances → `senat-stream` → Instance state → Start). Adresa se po startu změní, v konzoli ji najdeš znovu.
- [ ] Připojit se: Connect → EC2 Instance Connect (uživatel `ubuntu`).
- [ ] **Poslední aktualizace kódu a dat kandidátů:** `cd ~/senat2026 && git pull && cd deploy/stream && bash stream.sh up`. Tohle dělej dopředu, ne v sobotu.
- [ ] `bash stream.sh status`: `hlas` má být `"engine":"azure"`.
- [ ] Zkontrolovat, že se Azure Speech neblokuje (kvóta, klíč platný). Krátká zkouška nahrávky do souboru: v `.env` `MODE=file`, `DURATION=60`, `bash stream.sh restart`, pak zpět na `MODE=stream`.
- [ ] Instanci **nezastavovat** mezi pátkem a sobotou, jinak se mění adresa. Rezervovat si na sobotu čas na případné potíže.

## C. V sobotu 10. 10.

**Do 13:00** (žádné zapínání na poslední chvíli)
- [ ] Instance běží, jsi připojený z konferenční sítě/telefonu (EC2 Instance Connect funguje i v mobilu).
- [ ] `bash stream.sh status`: vše `neběží` je v pořádku (vysílání ještě nezačalo), hlas azure.
- [ ] Zapiš si čas, kdy má vysílání začít podle LinkedInu (událost 14:15, vysílat se smí od 14:00).

**Kolem 13:15 (hodinu před začátkem)**
- [ ] LinkedIn: událost → studio LinkedIn Live. Zkopírovat **Stream URL** a **Stream Key**. Klíč je na jednu událost.
- [ ] Na serveru zadat klíč (kapitola D).
- [ ] `bash stream.sh start`.
- [ ] Ve studiu LinkedIn Live se objeví náhled: zkontrolovat **obraz** (pravý sloupec, čas, žádný panel prohlížeče) a **zvuk**.
- [ ] Před 14:00 stránka ukazuje „Čekáme na první výsledky“. Číslo výsledků se před 14:00 nesmí zveřejňovat.

**14:15**
- [ ] Ve studiu LinkedIn Live kliknout **Go live**.
- [ ] Otevřít vysílání v druhém okně jako divák a poslechnout hlas (zpoždění desítky sekund je normální).

**Během vysílání (každých 20 až 30 minut)**
- [ ] `bash stream.sh status`: `speed=` kolem `1.0x` (pod `0.97x` je problém), `chyby přenosu` 0, `hlas` azure.
- [ ] Při větších výkyvech: `bash stream.sh screenshot` a `bash stream.sh logs`.
- [ ] Sledovat komentáře diváků (zejména hlášky o zvuku a obraze).

**Po vysílání**
- [ ] LinkedIn: ukončit vysílání ve studiu. Na serveru `bash stream.sh stop`.
- [ ] **Zastavit instanci** (Instance state → Stop). Kontejner i `.env` zůstanou pro druhé kolo.
- [ ] Smazat/neplatit klíč události (po ní sám vyprší). Obnovit Azure klíč, pokud jsi ho někde ukazoval.

---

## D. Jak zadat adresu a klíč (vkládání do `setkey` v prohlížečovém terminálu často nejde)

**LinkedIn** dává „Adresu URL kanálu“, která už na konci obsahuje klíč (`rtmps://…/live/<klíč>`). Server potřebuje adresu a klíč zvlášť, proto se z jednoho řetězce rozdělí:
```bash
nano url.tmp
```
V editoru vložit **celou adresu z LinkedInu** (Kopírovat u „Adresa URL kanálu“, `Ctrl+Shift+V` nebo pravé tlačítko), uložit `Ctrl+O`, Enter, `Ctrl+X`. Pak:
```bash
sed 's#/live/.*#/live#' url.tmp | tr -d '\r\n ' | docker compose exec -T -u node stream sh -c 'umask 077; cat > /data/rtmp.url'
sed 's#.*/live/##' url.tmp | tr -d '\r\n ' | docker compose exec -T -u node stream sh -c 'umask 077; cat > /data/rtmp.key'
shred -u url.tmp
docker compose exec -T -u node stream sh -c 'wc -c /data/rtmp.url /data/rtmp.key'
```
Očekávané délky: URL kolem 53 znaků, klíč 36 (u LinkedIn ukázky). Jiné služby (např. YouTube) dávají adresu a klíč zvlášť a tam se `sed` nepoužívá.
Klíč se do chatu ani do gitu nikdy nepíše. Před dalším zadáním smazat staré `*.tmp` (`shred -u url.tmp key.tmp`).

## E. Ostré nastavení `.env` na serveru

```
MODE=stream
TTS_ENGINE=azure
AZURE_SPEECH_KEY=<nový klíč>
AZURE_SPEECH_REGION=westeurope
AZURE_VOICE=cs-CZ-VlastaNeural
PAGE_QUERY=?autostart=1&hlas=server&bezovladani=1
```
**Nesmí tam být** `demo=noc&min=…`, `DURATION=…` ani `MODE=file`. Po každé změně: `bash stream.sh down && bash stream.sh up`, pak `start`.

## F. Když se něco pokazí

| Příznak | Co udělat |
|---|---|
| Obraz na LinkedInu zamrzl nebo je „Žádné údaje“ | `bash stream.sh status`. Když přenos neběží: `bash stream.sh restart`. Kontejner `docker compose logs --tail 30`. |
| `speed=` pod `0.97x` | V `.env` `X264_PRESET=superfast`, `FPS=25`, případně `V_BITRATE=3000k`, pak `down` a `up`, `start`. |
| Bez zvuku nebo nesrozumitelný | Zkontrolovat `bash stream.sh status` (řádek `hlas`). Nouzově Piper: `TTS_ENGINE=piper`, restart. Piper je horší, ale funguje offline. |
| Hlas Azure vrací chybu | Klíč nebo region v `.env` (401 = klíč, 403/404 = region), kvóta ve Speech. |
| Po restartu se opakují oznámení | Vysílání si pamatuje, co už zaznělo (20 hodin). Vynulovat lze `?reset=1` v `PAGE_QUERY`. Používat jen záměrně. |
| Server nejde spustit nebo připojit | Záložní plán: kolega s notebookem (OBS), viz [NAVOD-STREAM.md](../../NAVOD-STREAM.md). |
| Chyba `Permission denied` u `./stream.sh` | Spouštět jako `bash stream.sh …`. |

## G. Druhé kolo (16. až 17. 10.)

Stejný postup, ale klíč a událost jsou nové. Nový kód a data: `git pull && bash stream.sh up`. Stránka si druhé kolo řeší sama (oznámí rozhodnutí druhého kola).

## H. Náklady

Server `m7i-flex.large` stojí podle nabídky asi 0,10 USD za hodinu (Linux). Na účtu jsou kredity ($95,44 při posledním pohledu). Instanci zastavuj vždy, když nevysíláš. Přesnou spotřebu ukazuje Billing.
