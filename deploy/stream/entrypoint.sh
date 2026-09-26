#!/usr/bin/env bash
# Spouští se jako root: připraví svazky a předá řízení uživateli "node".
set -e
mkdir -p /data /out
chown -R node:node /data /out 2>/dev/null || true
exec runuser -u node -- /app/main.sh
