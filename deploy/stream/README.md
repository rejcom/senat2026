# Vysílání ze serveru (bez vašeho počítače)

Kontejner, který sám zvládne celé vysílání: **virtuální obrazovka + prohlížeč + zvuk + přenos na LinkedIn + český hlas**.
Server nemá plochu, kterou by šlo odpojit nebo zamknout, takže se vám nestane, že po zavření okna stream zčerná.
Ovládá se několika příkazy z terminálu (z notebooku, nebo i z telefonu přes prohlížečový terminál AWS).

```
server (AWS)  ─  Docker kontejner:  Xvfb ► Chromium (vysilani.html) ► ffmpeg ──► LinkedIn Live
                                    Piper (český hlas)  ┘
```

> **Stav ověření.**
>
> *Vyzkoušeno na vývojovém počítači (Docker Desktop, procesor ARM):* obraz 1920×1080 při 30 snímcích/s, zvuk s hlasem, kodér stíhá v reálném čase (rychlost ~1,0×),
> přenos protokolem RTMP na zkušební RTMP server, ffmpeg umí i šifrované RTMPS, po zabití prohlížeče se vysílání do 3 s obnoví, po výpadku protistrany se přenos sám znovu připojí do 5 s.
>
> *Neověřeno:* běh na vašem AWS serveru (x86, sestavení pro x86 jsem ověřil jen jako překlad, viz níže), příjem na skutečném **LinkedIn Live**, hlas z Azure (nemám váš klíč),
> dlouhodobá stabilita (zkoušky trvaly minuty, ne hodiny) a výkon na 4 vCPU. **Proto je tu kapitola „Zkouška“, kterou je potřeba projít nejpozději týden před volbami.**
> Nejdůležitější je, abyste si **poslechli hlas** (vzorek `promo/ukazka-hlas-piper.mp3`), nemohl jsem posoudit, jak zní.

## 0. Dvě věci, které je dobré vědět

- **Procesor.** Obraz se sestaví pro x86 (běžné servery AWS) i pro ARM (např. AWS Graviton), Dockerfile si vybere správnou verzi hlasu Piper sám.
- **Tempo hlasu.** Piper mluví pomalu (výchozí rychlost je asi 8 znaků za sekundu, člověk 14–15). Výchozí `PIPER_LENGTH_SCALE=0.8` ho zrychluje. Kdyby oznámení trvala dlouho, zkuste 0.7
  (zní stísněněji), nebo hlas Azure. Jednotlivé oznámení se čte kolem 20–30 sekund, při velkém počtu naráz rozhodnutých obvodů se proto fronta oznámení protáhne.

---

## 1. Co budete potřebovat

- **Server na AWS** (EC2) s Linuxem. Doporučení: **Ubuntu 24.04**, **4 vCPU a 8 GB paměti** (např. `c6i.xlarge` nebo `t3.xlarge`), region v EU, disk 30 GB.
  Přenos 1080p vyžaduje kódování videa procesorem. Dvě jádra by nestačila.
  Otevřený má být **jen SSH** (port 22), nic dalšího.
- **Docker** na serveru: `sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git && sudo usermod -aG docker $USER` (pak se odhlásit a znovu přihlásit).
- **Stream URL a Stream Key z LinkedInu** (viz [NAVOD-STREAM.md](../../NAVOD-STREAM.md), kapitola 5). Zpřístupní se hodinu před začátkem události.

## 2. Instalace na server (jednou)

```bash
git clone https://github.com/rejcom/senat2026.git
cd senat2026/deploy/stream
cp .env.example .env          # výchozí hodnoty stačí
./stream.sh up                # sestaví a spustí kontejner (první sestavení trvá několik minut)
```

Data kandidátů jsou „zamrzlá“ v obrazu v době sestavení. Před volbami proto naposledy `git pull && ./stream.sh up`, ať jsou aktuální.

## 3. Ovládání

Všechny příkazy se spouští ve složce `senat2026/deploy/stream`:

| Příkaz | Co dělá |
|---|---|
| `./stream.sh setkey` | Zeptá se na **Stream URL** a **Stream Key** z LinkedInu a uloží je. Klíč se na obrazovce nezobrazí. |
| `./stream.sh start` | **Spustí vysílání** (prohlížeč a přenos). |
| `./stream.sh status` | Co běží, stav přenosu (snímky, datový tok), stav hlasu, poslední zprávy. |
| `./stream.sh screenshot` | Uloží snímek toho, co se právě vysílá, do `out/screenshot.png`. |
| `./stream.sh logs` | Posledních pár řádků protokolů. |
| `./stream.sh stop` | Zastaví vysílání. |
| `./stream.sh restart` | Zastaví a znovu spustí. |
| `./stream.sh down` | Vypne kontejner úplně. |

**Vysílání se po pádu samo obnoví.** Když spadne prohlížeč nebo přenos, hlídač je za pár sekund spustí znovu. Vysílání si navíc pamatuje, co už zaznělo
(je uloženo v datech prohlížeče v kontejneru), takže po restartu řekne „Vysílání pokračuje“ a nic neopakuje.

## 4. Ovládání z konference (telefon nebo notebook)

Nejjednodušší je **terminál přímo v AWS konzoli**: EC2 → váš server → **Connect** → *EC2 Instance Connect* (nebo *Session Manager*). Otevře se terminál v prohlížeči,
bez klíčů a bez instalace, jde použít i na telefonu. Pak stačí zadat příkazy z kapitoly 3.

Kdo preferuje klasický SSH klient: na telefonu např. Termius. Uložte si klíč a adresu serveru dopředu.

## 5. Hlas

Výchozí je **Piper** (zdarma, běží přímo v kontejneru, český mužský hlas „jirka“). Kvalitnější a přirozenější je **Azure Neural** (např. `cs-CZ-VlastaNeural`),
ten ale vyžaduje váš účet a klíč. Přepnutí je v souboru `.env`:

```
TTS_ENGINE=azure
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=westeurope
AZURE_VOICE=cs-CZ-VlastaNeural
```

Pak `./stream.sh down && ./stream.sh up`. Hlas z Azure jsem v kódu připravil, ale **nemohl jsem ho vyzkoušet** (nemám váš klíč), takže ho před volbami vyzkoušejte.
Výslovnost stran (co se čte jak) je stejná jako ve zbytku projektu (`src/pronunciation.js`, kontrola na `vyslovnost.html`).

## 6. Zkouška (povinná)

1. Na serveru `./stream.sh up`, pak **na zkoušku bez LinkedInu**: v `.env` nastavte `MODE=file`, `PAGE_QUERY=?demo=noc&min=1&autostart=1&hlas=server&bezovladani=1`, `DURATION=120`, spusťte `./stream.sh restart`.
   Za dvě minuty je v `out/test.mkv` záznam. Stáhněte si ho a přehrajte: musí být obraz i **hlas**.
2. Pak zkouška na **skutečném LinkedIn Live**. Naplánujte si zkušební událost (jen pro pár lidí), hodinu před začátkem získejte klíč, `./stream.sh setkey`, `./stream.sh start`,
   v LinkedIn Live Studiu zkontrolujte náhled (obraz, zvuk) a klikněte Go live. Nechte běžet aspoň 30 minut a sledujte `./stream.sh status`.
3. Zkuste i pád: `docker compose exec stream pkill chromium` a ověřte, že se prohlížeč vrátí a vysílání naváže.

## 7. V den voleb

- Před začátkem `./stream.sh status` (vše musí běžet), pak `setkey` (klíč platí na jednu událost), `start`, kontrola náhledu v LinkedIn Live Studiu, **Go live**.
- Sledujte LinkedIn (zpoždění desítky sekund) a občas `./stream.sh screenshot`.
- Záložní plán: kolega s notebookem, který vysílání spustí podle [NAVOD-STREAM.md](../../NAVOD-STREAM.md).

## 8. Náklady a bezpečnost

- Server je potřeba jen pár hodin (spouštějte ho těsně před vysíláním a po něm zastavte). Řádově jde o jednotky dolarů. **Přesnou cenu ověřte v ceníku AWS.**
- Klíč k přenosu je uložen jen v kontejneru (soubor s omezeným přístupem) a nikam se neposílá. Po události je neplatný.
- Prohlížeč v kontejneru běží bez „sandboxu“ (v Dockeru to tak bývá) a otevírá jen naši vlastní stránku a data ČSÚ.
- Port 8787 je publikovaný jen na `127.0.0.1` serveru, zvenku nedostupný.
