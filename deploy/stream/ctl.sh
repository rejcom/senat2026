#!/usr/bin/env bash
# Ovládání vysílání uvnitř kontejneru: start | stop | status | screenshot
# (na serveru se volá přes stream.sh)
export DISPLAY=:99
PIDF=/data/supervisor.pid
LOGD=/data/log
mkdir -p "$LOGD"

running() { [ -s "$PIDF" ] && kill -0 -- "-$(cat "$PIDF")" 2>/dev/null; }

case "${1:-status}" in
  start)
    if running; then echo "Vysílání už běží."; exit 0; fi
    if [ "${MODE:-stream}" = "stream" ] && { [ ! -s /data/rtmp.url ] || [ ! -s /data/rtmp.key ]; }; then
      echo "Chybí Stream URL a klíč. Nejdřív: ./stream.sh setkey"
      exit 2
    fi
    : > "$LOGD/ffmpeg.log"
    : > "$LOGD/supervise.log"
    setsid /app/supervise.sh >> "$LOGD/supervise.log" 2>&1 &
    echo $! > "$PIDF"
    echo "Vysílání se spouští (prohlížeč se načte za pár sekund, přenos naváže za ~12 s)."
    ;;
  stop)
    if running; then
      kill -TERM -- "-$(cat "$PIDF")" 2>/dev/null
      sleep 2
      kill -KILL -- "-$(cat "$PIDF")" 2>/dev/null
      pkill -f "chromium.*user-data-dir=/data/chrome" 2>/dev/null
      rm -f "$PIDF"
      echo "Vysílání zastaveno."
    else
      echo "Vysílání neběží."
    fi
    ;;
  status)
    if running; then echo "VYSÍLÁNÍ: běží"; else echo "VYSÍLÁNÍ: neběží"; fi
    echo "prohlížeč: $(pgrep -f 'chromium.*user-data-dir=/data/chrome' > /dev/null && echo běží || echo neběží)"
    echo "přenos (ffmpeg): $(pgrep -x ffmpeg > /dev/null && echo běží || echo neběží)"
    if [ -s "$LOGD/ffmpeg.log" ]; then
      echo "poslední stav přenosu: $(tr '\r' '\n' < "$LOGD/ffmpeg.log" | grep -E 'frame=' | tail -n 1)"
      echo "chyby přenosu: $(tr '\r' '\n' < "$LOGD/ffmpeg.log" | grep -ciE 'error|failed|refused|broken pipe') (posledních řádků: $(tr '\r' '\n' < "$LOGD/ffmpeg.log" | grep -iE 'error|failed|refused|broken pipe' | tail -n 1))"
    fi
    echo "hlas: $(curl -s -m 3 http://localhost:8787/tts/health || echo 'server neodpovídá')"
    echo "poslední zprávy hlídače:"
    tail -n 4 "$LOGD/supervise.log" 2> /dev/null | sed 's/^/  /'
    ;;
  screenshot)
    ffmpeg -y -loglevel error -f x11grab -video_size 1920x1080 -i :99 -frames:v 1 /out/screenshot.png && echo "Snímek uložen: /out/screenshot.png"
    ;;
  *)
    echo "Použití: ctl.sh start|stop|status|screenshot"
    exit 1
    ;;
esac
