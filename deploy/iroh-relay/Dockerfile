FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gosu \
 && curl -fsSL https://github.com/n0-computer/iroh/releases/download/v1.4.1/iroh-relay-v1.4.1-x86_64-unknown-linux-musl.tar.gz -o /tmp/relay.tar.gz \
 && echo '75254641e3fad7fcbac6dee4d485556fbe06ef708340a9d8810469270ba626b8  /tmp/relay.tar.gz' | sha256sum -c - \
 && tar -xzf /tmp/relay.tar.gz -C /usr/local/bin --strip-components=1 \
 && rm /tmp/relay.tar.gz && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY gateway.mjs relay.toml entrypoint.sh ./
RUN mkdir /data && chmod 755 /app/entrypoint.sh
USER root
ENV PORT=8080 RELAY_DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
