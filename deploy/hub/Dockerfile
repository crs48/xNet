FROM rust:1.97.1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY apps apps
COPY web web
RUN cargo build --locked --release -p community-registry

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gosu \
 && curl -fsSL https://github.com/n0-computer/iroh/releases/download/v1.4.1/iroh-relay-v1.4.1-x86_64-unknown-linux-musl.tar.gz -o /tmp/relay.tar.gz \
 && echo '75254641e3fad7fcbac6dee4d485556fbe06ef708340a9d8810469270ba626b8  /tmp/relay.tar.gz' | sha256sum -c - \
 && tar -xzf /tmp/relay.tar.gz -C /usr/local/bin --strip-components=1 \
 && rm /tmp/relay.tar.gz && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/target/release/community-registry /usr/local/bin/
COPY hub.mjs gateway.mjs relay.toml ./
ENV PORT=8080 RELAY_DATA_DIR=/data TOKIO_WORKER_THREADS=2
EXPOSE 8080
CMD mkdir -p "$RELAY_DATA_DIR" && chown node:node "$RELAY_DATA_DIR" && exec gosu node node /app/hub.mjs
