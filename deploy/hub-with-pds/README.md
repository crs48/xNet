# Hub + PDS: one command, one domain

The "everything is a hub, plus one blessed sidecar" deployment (explorations
0365/0382/0383). The hub is xNet's server in whatever role you choose
(`HUB_ROLE=personal|demo|community|index|registry|gateway`); the PDS is the
**official** `bluesky-social/pds` container — deliberately a neighbour, never a
hub role, because its invariants are atproto's, not ours.

```bash
export DOMAIN=example.com
export PDS_ADMIN_PASSWORD=$(openssl rand -hex 16)
export PDS_JWT_SECRET=$(openssl rand -hex 16)
export PDS_PLC_ROTATION_KEY=$(openssl ecparam --name secp256k1 --genkey --noout --outform DER | tail --bytes=+8 | head --bytes=32 | xxd --plain --cols 32)
docker compose up -d
```

DNS: `hub.$DOMAIN`, `pds.$DOMAIN` **and `*.pds.$DOMAIN`** (the PDS mints
per-handle subdomain certificates) must point at this machine.

Health: `https://hub.$DOMAIN/health` (note the hub's persistent `hubDid` in the
response) and `https://pds.$DOMAIN/xrpc/_health`.

Managed-fleet placement of the same sidecar goes through the provisioner's
`ProvisionSpec.sidecars` slot (`packages/cloud/src/provisioner/types.ts`).
