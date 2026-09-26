#!/usr/bin/env bash
# Ovládání vysílání na serveru. Použití:  ./stream.sh  up | setkey | start | stop | restart | status | logs | screenshot | down
cd "$(dirname "$0")" || exit 1
mkdir -p out
dc() { docker compose "$@"; }
inx() { dc exec -T -u node stream "$@"; }

case "${1:-help}" in
  up)          dc up -d --build ;;                                   # sestaví a spustí kontejner (vysílání zatím nezačne)
  setkey)      # zeptá se na Stream URL a klíč z LinkedInu a uloží je (klíč se nezobrazuje ani neukládá do historie)
               read -r -p "Stream URL (z LinkedInu): " u
               read -r -s -p "Stream Key (z LinkedInu): " k; echo
               printf %s "$u" | inx sh -c 'umask 077; cat > /data/rtmp.url'
               printf %s "$k" | inx sh -c 'umask 077; cat > /data/rtmp.key'
               echo "Uloženo." ;;
  start)       dc up -d && inx /app/ctl.sh start ;;
  stop)        inx /app/ctl.sh stop ;;
  restart)     inx /app/ctl.sh stop; sleep 2; inx /app/ctl.sh start ;;
  status)      inx /app/ctl.sh status ;;
  logs)        inx sh -c 'echo "--- hlídač"; tail -n 15 /data/log/supervise.log; echo "--- přenos"; tr "\r" "\n" < /data/log/ffmpeg.log | tail -n 8; echo "--- server"; tail -n 8 /data/log/server.log' ;;
  screenshot)  inx /app/ctl.sh screenshot && echo "Snímek je v: $(pwd)/out/screenshot.png" ;;
  down)        dc down ;;
  *)           sed -n '2p' "$0" ;;
esac
