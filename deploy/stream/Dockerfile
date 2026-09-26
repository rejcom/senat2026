# Vysílací kontejner: virtuální obrazovka + prohlížeč + zvuk + ffmpeg (přenos na LinkedIn) + hlas ze serveru (Piper).
# Sestavuje se z kořene projektu (viz docker-compose.yml). Sestavený web je „zamrzlý“ v obrazu, takže se za běhu nemění.

# ---- 1) sestavení webu ----
FROM node:22-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2) vysílací kontejner ----
FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium xvfb pulseaudio pulseaudio-utils ffmpeg tini procps curl ca-certificates \
      fonts-noto-core fonts-noto-ui-core fonts-liberation fonts-dejavu-core fontconfig tzdata \
 && rm -rf /var/lib/apt/lists/*

# Chromium bez vyskakovacích oken (nabídka překladu by překrývala obraz vysílání)
RUN mkdir -p /etc/chromium/policies/managed \
 && printf '{"TranslateEnabled": false, "DefaultBrowserSettingEnabled": false, "PasswordManagerEnabled": false, "MetricsReportingEnabled": false}\n' > /etc/chromium/policies/managed/stream.json

# Piper (offline hlas) a český hlas „jirka“ (mužský, kvalita medium; data CC0)
ARG PIPER_VERSION=2023.11.14-2
ARG VOICE_URL=https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium
ARG TARGETARCH
# Piper se stahuje pro procesor, na kterém obraz poběží (x86_64 = běžné servery, aarch64 = ARM / AWS Graviton)
RUN case "${TARGETARCH:-amd64}" in \
      amd64) PIPER_ARCH=x86_64 ;; \
      arm64) PIPER_ARCH=aarch64 ;; \
      *) echo "nepodporovaná architektura: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_${PIPER_ARCH}.tar.gz" | tar -xz -C /opt \
 && mkdir -p /opt/piper/voices \
 && curl -fsSL -o /opt/piper/voices/cs_CZ-jirka-medium.onnx      "${VOICE_URL}/cs_CZ-jirka-medium.onnx" \
 && curl -fsSL -o /opt/piper/voices/cs_CZ-jirka-medium.onnx.json "${VOICE_URL}/cs_CZ-jirka-medium.onnx.json"

COPY --from=web /src/dist /app/dist
COPY deploy/stream/server.mjs deploy/stream/entrypoint.sh deploy/stream/main.sh deploy/stream/supervise.sh deploy/stream/ctl.sh /app/
RUN chmod +x /app/*.sh

ENV TZ=Europe/Prague \
    TTS_ENGINE=piper \
    PIPER_BIN=/opt/piper/piper \
    PIPER_MODEL=/opt/piper/voices/cs_CZ-jirka-medium.onnx \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONUTF8=1 \
    PYTHONIOENCODING=utf-8

VOLUME ["/data", "/out"]
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
