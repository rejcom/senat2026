#!/usr/bin/env bash
# Hlídač vysílání: drží spuštěný prohlížeč a přenos (ffmpeg). Když jeden spadne, za pár sekund ho spustí znovu.
# MODE=stream  posílá na LinkedIn (URL a klíč ze souborů /data/rtmp.url a /data/rtmp.key)
# MODE=file    nahrává do souboru /out/$OUT_NAME (jen pro zkoušku), DURATION = délka v sekundách
set -u
export DISPLAY=:99
export HOME=/home/node
export XDG_RUNTIME_DIR=/tmp/runtime-node
MODE=${MODE:-stream}
PAGE_QUERY=${PAGE_QUERY:-"?autostart=1&hlas=server&bezovladani=1"}
URL="http://localhost:8787/vysilani.html${PAGE_QUERY}"
FPS=${FPS:-30}
V_BITRATE=${V_BITRATE:-4500k}
LOG=/data/log

say() { echo "[$(date +%T)] $*"; }

chromium_loop() {
  while true; do
    rm -f /data/chrome/SingletonLock /data/chrome/SingletonCookie /data/chrome/SingletonSocket
    say "spouštím prohlížeč: $URL"
    chromium --no-sandbox --disable-gpu --disable-dev-shm-usage \
      --kiosk --start-fullscreen --window-position=0,0 --window-size=1920,1080 --force-device-scale-factor=1 \
      --user-data-dir=/data/chrome --lang=cs-CZ \
      --autoplay-policy=no-user-gesture-required \
      --no-first-run --no-default-browser-check --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
      --disable-features=Translate,MediaRouter,TranslateUI \
      --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
      --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
      "$URL" >> "$LOG/chromium.log" 2>&1
    say "prohlížeč skončil, spouštím znovu za 3 s"
    sleep 3
  done
}

encode() {
  # $1 = výstup (soubor nebo rtmp), $2 = formát, zbytek = další parametry
  local out=$1 fmt=$2
  shift 2
  ffmpeg -hide_banner -loglevel warning -stats \
    -thread_queue_size 1024 -f x11grab -framerate "$FPS" -video_size 1920x1080 -draw_mouse 0 -i :99 \
    -thread_queue_size 1024 -f pulse -i vsink.monitor \
    -c:v libx264 -preset "${X264_PRESET:-veryfast}" -profile:v high -pix_fmt yuv420p \
    -b:v "$V_BITRATE" -maxrate "$V_BITRATE" -bufsize "$(( ${V_BITRATE%k} * 2 ))k" \
    -g $(( FPS * 2 )) -keyint_min $(( FPS * 2 )) -sc_threshold 0 \
    -af alimiter=limit=0.8 -c:a aac -b:a 160k -ar 44100 -ac 2 \
    "$@" -f "$fmt" "$out"
}

ffmpeg_loop() {
  sleep "${FFMPEG_DELAY:-12}" # prohlížeč a stránka se musí stihnout načíst
  if [ "$MODE" = "file" ]; then
    say "nahrávám do /out/${OUT_NAME:-test.mkv} (${DURATION:-60} s)"
    encode "/out/${OUT_NAME:-test.mkv}" matroska -t "${DURATION:-60}" 2>> "$LOG/ffmpeg.log"
    say "nahrávání dokončeno"
    return
  fi
  while true; do
    if [ ! -s /data/rtmp.url ] || [ ! -s /data/rtmp.key ]; then
      say "chybí Stream URL nebo klíč (stream.sh setkey), čekám"
      sleep 10
      continue
    fi
    local out
    out="$(cat /data/rtmp.url | tr -d '\r\n ')/$(cat /data/rtmp.key | tr -d '\r\n ')"
    say "přenos začíná"
    encode "$out" flv 2>> "$LOG/ffmpeg.log"
    say "přenos skončil (kód $?), znovu za 5 s"
    sleep 5
  done
}

chromium_loop &
CHR=$!
ffmpeg_loop
if [ "$MODE" = "file" ]; then
  kill "$CHR" 2>/dev/null
  pkill -f "chromium.*user-data-dir=/data/chrome" 2>/dev/null
  exit 0
fi
wait
