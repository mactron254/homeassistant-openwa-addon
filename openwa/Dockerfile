ARG BUILD_FROM=ghcr.io/rmyndharis/openwa:latest
FROM ${BUILD_FROM}

USER root

ENTRYPOINT []

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      ffmpeg \
      procps \
    && rm -rf /var/lib/apt/lists/*

COPY run.sh /run.sh
COPY bot /opt/openwa-bot

RUN chmod a+x /run.sh \
    && corepack enable \
    && corepack prepare pnpm@11.0.0 --activate \
    && cd /opt/openwa-bot \
    && pnpm install --prod --frozen-lockfile

CMD ["/run.sh"]
