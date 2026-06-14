# @xnetjs/cloud-litestream

SQLite → R2 replication for the managed fleet, staying on better-sqlite3. See exploration 0178.

Config + argv builders, a supervised controller that drains before close, and replication-freshness checks. The decision behind this package: stay on better-sqlite3 + [Litestream](https://litestream.io/) → R2 rather than adopting libSQL.

## Features

- **Config builders** -- `litestreamConfig` + `toYaml`: build a Litestream config (with R2 replicas) programmatically
- **Command builders** -- `restoreArgs` / `replicateArgs`: construct `litestream` CLI argv for restore and continuous replication
- **Supervised controller** -- `LitestreamController`: spawns and supervises the replicate process and drains the WAL before close (`DrainResult`), with an injectable `Spawner` for testing
- **Freshness checks** -- `replicaLagMs`, `isReplicaFresh`, `isFullySynced`: gate reads/cutover on replication lag

## Usage

```typescript
import { litestreamConfig, toYaml, LitestreamController } from '@xnetjs/cloud-litestream'

const config = litestreamConfig({
  dbPath: '/data/hub.db',
  replica: {
    type: 's3',
    bucket: 'hub-backups',
    endpoint: 'https://<account>.r2.cloudflarestorage.com'
  }
})

const controller = new LitestreamController({ config })
await controller.start()
// ...on shutdown:
const drain = await controller.stop()
```

## Modules

| Module          | Description                                        |
| --------------- | -------------------------------------------------- |
| `config.ts`     | Litestream config builder + YAML serialization     |
| `commands.ts`   | `restore` / `replicate` CLI argv builders          |
| `controller.ts` | Supervised replicate process w/ drain-before-close |
| `freshness.ts`  | Replication lag / freshness checks                 |

## Testing

```bash
pnpm --filter @xnetjs/cloud-litestream test
```
