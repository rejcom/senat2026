#!/usr/bin/env bash
# Základní služby kontejneru: virtuální obrazovka, zvuk, server s webem a hlasem.
# Samotné vysílání (prohlížeč + přenos) se spouští až příkazem `ctl.sh start` (nebo AUTOSTART=1).
set -u
export DISPLAY=:99
export HOME=/home/node
export XDG_RUNTIME_DIR=/tmp/runtime-node
mkdir -p "$XDG_RUNTIME_DIR" /data/log /data/chrome /data/cache
chmod 700 "$XDG_RUNTIME_DIR"
echo "== start $(date -Is)" >> /data/log/main.log

Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >> /data/log/xvfb.log 2>&1 &

# zvuk: prázdné zařízení „vsink“, do kterého prohlížeč přehrává a ze kterého ffmpeg zvuk bere
pulseaudio --daemonize=yes --exit-idle-time=-1 --log-target=file:/data/log/pulse.log
sleep 1
pactl load-module module-null-sink sink_name=vsink sink_properties=device.description=StreamSink > /dev/null
pactl set-default-sink vsink

node /app/server.mjs >> /data/log/server.log 2>&1 &

if [ "${AUTOSTART:-0}" = "1" ]; then
  sleep 3
  /app/ctl.sh start
fi

wait
