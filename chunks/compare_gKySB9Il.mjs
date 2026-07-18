const updated = "July 2026";
const layers = [
  // ─── Layer 1: Products ────────────────────────────────────────────────────
  {
    id: "products",
    title: "Products you can use today",
    shortTitle: "Products",
    intro: "End-user apps compared on ownership, offline, and collaboration. This is where the xNet App competes directly — from cloud-first workspaces to local-first knowledge tools.",
    lastVerified: "June 2026",
    columns: [
      { key: "localFirst", label: "Local-first" },
      { key: "offline", label: "Offline" },
      { key: "collab", label: "Collab & comms" },
      { key: "license", label: "License" },
      { key: "ai", label: "AI / agents" },
      { key: "pricing", label: "Pricing" }
    ],
    projects: [
      {
        name: "xNet App",
        url: "https://github.com/crs48/xNet",
        highlight: true,
        maturity: "pre-release",
        license: "MIT",
        bestFor: "A workspace you fully own — documents, databases, canvas, tasks, chat",
        dims: {
          localFirst: "yes",
          offline: "yes",
          collab: "P2P real-time + chat, presence & calls",
          ai: "xnet CLI + SKILL.md agent surface",
          pricing: "Free"
        },
        details: {
          "Rich text": "TipTap + Yjs",
          Databases: "15 property types, views",
          Canvas: "Infinite canvas",
          Plugins: "4-layer system",
          "Data ownership": "Local, encrypted",
          Platforms: "Desktop (Electron), Web; mobile in development",
          "Self-host": "P2P; optional Hub (backup, relay, search)"
        },
        footnotes: ["xnet-prerelease", "xnet-encryption", "xnet-plugins"]
      },
      {
        name: "Notion",
        url: "https://notion.so",
        maturity: "production",
        license: "Proprietary",
        bestFor: "Team workspace with mature SaaS polish",
        dims: {
          localFirst: "no",
          offline: { v: "partial", fn: "notion-offline" },
          collab: "Real-time (server), comments",
          ai: "Notion AI (cloud)",
          pricing: "Freemium"
        },
        details: {
          "Rich text": "Block editor",
          Databases: "Full (views, relations)",
          Canvas: "No",
          Plugins: "Integrations API",
          "Data ownership": "Cloud",
          Platforms: "Desktop, Web, Mobile",
          "Self-host": "No"
        }
      },
      {
        name: "Airtable",
        url: "https://airtable.com",
        maturity: "production",
        license: "Proprietary",
        bestFor: "Relational tables and automations as SaaS",
        dims: {
          localFirst: "no",
          offline: "no",
          collab: "Real-time (server)",
          ai: "Airtable AI (cloud)",
          pricing: "Freemium"
        },
        details: {
          "Rich text": "Rich field type",
          Databases: "Full (views, automations)",
          Canvas: "Interfaces",
          Plugins: "Extensions + scripts",
          "Data ownership": "Cloud",
          Platforms: "Web, Mobile",
          "Self-host": "No"
        }
      },
      {
        name: "Obsidian",
        url: "https://obsidian.md",
        maturity: "production",
        license: "Proprietary (free personal)",
        bestFor: "Personal knowledge on plain Markdown files",
        dims: {
          localFirst: "yes",
          offline: "yes",
          collab: "Paid sync; collab via plugins",
          ai: "Community plugins / MCP",
          pricing: "Free; paid sync"
        },
        details: {
          "Rich text": "Markdown",
          Databases: "Bases (core, 1.9+)",
          Canvas: "Canvas (core)",
          Plugins: "Huge community ecosystem",
          "Data ownership": "Local files",
          Platforms: "Desktop, Mobile",
          "Self-host": "Files on disk; sync optional"
        }
      },
      {
        name: "Anytype",
        url: "https://anytype.io",
        maturity: "production",
        license: "Source-available",
        bestFor: "Local-first personal knowledge base with typed objects",
        dims: {
          localFirst: "yes",
          offline: "yes",
          collab: "Spaces (P2P network)",
          ai: "Local AI agents (prototype)",
          pricing: "Free; paid tiers"
        },
        details: {
          "Rich text": "Block editor",
          Databases: "Relations + views",
          Canvas: "Graph + canvas",
          Plugins: "No",
          "Data ownership": "Local, E2EE, P2P",
          Platforms: "Desktop, Web, Mobile",
          "Self-host": "Self-hosted nodes"
        },
        footnotes: ["anytype-license"]
      },
      {
        name: "Logseq",
        url: "https://logseq.com",
        maturity: "production",
        license: "AGPL-3.0",
        bestFor: "Open-source outliner PKM",
        dims: {
          localFirst: "yes",
          offline: "yes",
          collab: { v: "partial", fn: "logseq-db" },
          ai: "Community plugins",
          pricing: "Free"
        },
        details: {
          "Rich text": "Outliner (Markdown / Org)",
          Databases: "DB version (beta)",
          Canvas: "Whiteboards",
          Plugins: "Community plugins",
          "Data ownership": "Local files / local DB",
          Platforms: "Desktop, Mobile",
          "Self-host": "Files on disk"
        }
      },
      {
        name: "Joplin",
        url: "https://joplinapp.org",
        maturity: "production",
        license: "AGPL-3.0",
        bestFor: "E2EE notes across every platform",
        dims: {
          localFirst: "yes",
          offline: "yes",
          collab: "Shared notebooks (server)",
          ai: "Plugins",
          pricing: "Free; paid cloud"
        },
        details: {
          "Rich text": "Markdown",
          Databases: "No",
          Canvas: "No",
          Plugins: "Plugin ecosystem",
          "Data ownership": "Local + E2EE sync",
          Platforms: "Desktop, Mobile, Terminal",
          "Self-host": "Joplin Server"
        }
      },
      {
        name: "AppFlowy",
        url: "https://appflowy.com",
        maturity: "beta",
        license: "AGPL-3.0",
        bestFor: "Open-source Notion alternative",
        dims: {
          localFirst: "yes",
          offline: "yes",
          collab: "Real-time (cloud)",
          ai: "AI meeting notes; local models",
          pricing: "Free; cloud plans"
        },
        details: {
          "Rich text": "Block editor",
          Databases: "Grid, board, calendar",
          Canvas: "No",
          Plugins: "Limited",
          "Data ownership": "Local + optional cloud",
          Platforms: "Desktop, Mobile",
          "Self-host": "Full (AppFlowy Cloud)"
        }
      },
      {
        name: "AFFiNE",
        url: "https://affine.pro",
        maturity: "beta",
        license: "MIT (Community Edition)",
        bestFor: "Docs + whiteboard hybrid, open source",
        dims: {
          localFirst: "yes",
          offline: "yes",
          collab: "Real-time (Yjs cloud)",
          ai: "Built-in AI workspace",
          pricing: "Free; cloud plans"
        },
        details: {
          "Rich text": "BlockSuite editor",
          Databases: "Table views",
          Canvas: "Edgeless mode",
          Plugins: "In development",
          "Data ownership": "Local + optional cloud",
          Platforms: "Desktop, Web, Mobile",
          "Self-host": "Full"
        }
      }
    ],
    chips: [
      {
        name: "Linear",
        url: "https://linear.app",
        note: "Cloud issue tracker with a local-feeling sync engine"
      },
      { name: "Coda", url: "https://coda.io", note: "Cloud docs + tables + automations" },
      {
        name: "Notesnook",
        url: "https://notesnook.com",
        note: "Zero-knowledge E2EE notes; self-hostable sync"
      },
      {
        name: "Standard Notes",
        url: "https://standardnotes.com",
        note: "Audited E2EE notes (Proton)"
      },
      {
        name: "Outline",
        url: "https://www.getoutline.com",
        note: "Open-source team wiki (server-based)"
      },
      { name: "Capacities", url: "https://capacities.io", note: "Object-based PKM studio" },
      { name: "Heptabase", url: "https://heptabase.com", note: "Visual whiteboard knowledge base" },
      {
        name: "Tana",
        url: "https://tana.inc",
        note: "AI-native knowledge graph; API + MCP server"
      },
      { name: "Reflect", url: "https://reflect.app", note: "E2EE networked notes; MCP server" },
      {
        name: "Bear",
        url: "https://bear.app",
        note: "Polished Mac/iOS Markdown notes (CloudKit E2EE)"
      },
      { name: "Craft", url: "https://www.craft.do", note: "Polished document workspace" },
      {
        name: "Roam Research",
        url: "https://roamresearch.com",
        note: "Outliner pioneer, now low-velocity"
      },
      { name: "Twos", url: "https://www.twosapp.com", note: "Lightweight notes, tasks & lists" },
      { name: "Evernote", url: "https://evernote.com", note: "Legacy notes baseline" }
    ],
    footnotes: [
      {
        id: "xnet-prerelease",
        text: "xNet is pre-release; its rows reflect shipped behavior (see the roadmap), not future plans.",
        sourceUrl: "https://github.com/crs48/xNet"
      },
      {
        id: "xnet-encryption",
        text: "Data is encrypted at rest with encryption-first authorization; end-to-end encrypted channels are on the roadmap.",
        sourceUrl: "https://github.com/crs48/xNet"
      },
      {
        id: "xnet-plugins",
        text: "Plugin layers are first-party today; isolation for untrusted third-party plugins is still in development.",
        sourceUrl: "https://github.com/crs48/xNet"
      },
      {
        id: "notion-offline",
        text: "Per-page opt-in offline shipped Aug 2025, with limits (e.g. database row caps).",
        sourceUrl: "https://www.notion.com/releases/2025-08-19"
      },
      {
        id: "logseq-db",
        text: "Logseq split into file-based and DB versions (May 2026); the DB version is in beta with real-time sync in alpha.",
        sourceUrl: "https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020"
      },
      {
        id: "anytype-license",
        text: "Source-available under the Any Source Available License — not OSI open source.",
        sourceUrl: "https://github.com/anyproto/anytype-ts"
      }
    ]
  },
  // ─── Layer 2: App frameworks ──────────────────────────────────────────────
  {
    id: "frameworks",
    title: "App frameworks",
    shortTitle: "Frameworks",
    intro: "What you'd build a local-first app with: schemas, stores, hooks, and sync in one package. xNet's SDK competes here. Convex and InstantDB are included as cloud-first baselines because framework buyers routinely weigh them against these tools.",
    lastVerified: "June 2026",
    columns: [
      { key: "license", label: "License" },
      { key: "sync", label: "Sync topology" },
      { key: "conflict", label: "Conflict model" },
      { key: "identity", label: "Identity / auth" },
      { key: "ai", label: "AI / agents" },
      { key: "bestFor", label: "Best for" }
    ],
    projects: [
      {
        name: "xNet",
        url: "https://github.com/crs48/xNet",
        highlight: true,
        maturity: "pre-release",
        license: "MIT",
        bestFor: "Full-stack local-first apps: typed data + rich text + canvas + comms",
        dims: {
          sync: "P2P (WebRTC); optional Hub",
          conflict: "Yjs + Lamport LWW",
          identity: { v: "DID:key + UCAN", fn: "ucan" },
          ai: "xnet CLI + SKILL.md + files-first checkout"
        },
        details: {
          Schema: "TypeScript defineSchema()",
          "React hooks": "useQuery / useMutate / useNode",
          "Type safety": "Full inference",
          Platforms: "Electron + Web; mobile in development",
          "Self-host": "No server required; optional Hub (backup, relay, search)",
          Encryption: "Encrypted at rest; E2EE channels on roadmap"
        },
        footnotes: ["fw-xnet-prerelease"]
      },
      {
        name: "Jazz",
        url: "https://jazz.tools",
        maturity: "alpha",
        license: "MIT",
        bestFor: "Greenfield TS apps wanting batteries-included sync + auth",
        dims: {
          sync: "Sync server (Jazz Cloud or self-host)",
          conflict: "CoJSON CRDTs (own engine)",
          identity: "Built-in (accounts, passkeys)",
          ai: "—"
        },
        details: {
          Schema: "CoValues (TypeScript)",
          "React hooks": "useCoState",
          "Type safety": "Full inference",
          Platforms: "Web + React Native",
          "Self-host": "Self-host sync server; cloud scales to zero",
          Encryption: "Built-in encryption"
        },
        footnotes: ["jazz-v2"]
      },
      {
        name: "Triplit",
        url: "https://triplit.dev",
        maturity: "production",
        license: "AGPL-3.0",
        bestFor: "Typed full-stack sync with relational queries",
        dims: {
          sync: "Sync server (WebSocket)",
          conflict: "LWW per-attribute",
          identity: "External (JWT)",
          ai: "—"
        },
        details: {
          Schema: "TypeScript",
          "React hooks": "useQuery",
          "Type safety": "Full inference",
          Platforms: "Web + Mobile",
          "Self-host": "Self-host server",
          Encryption: "Transport (TLS)"
        },
        footnotes: ["triplit-velocity"]
      },
      {
        name: "LiveStore",
        url: "https://livestore.dev",
        maturity: "beta",
        license: "Apache-2.0",
        bestFor: "Event-sourced client state with SQLite reactivity",
        dims: {
          sync: "Event log; pluggable backends (Cloudflare, S2)",
          conflict: "Event-log rebase",
          identity: "External",
          ai: "MCP server support (0.4)"
        },
        details: {
          Schema: "Schema-first SQLite tables",
          "React hooks": "useStore / useQuery (multi-store)",
          "Type safety": "Full inference (Effect)",
          Platforms: "Web, Expo, Node",
          "Self-host": "Client-first; sync backend optional",
          Encryption: "App-defined"
        }
      },
      {
        name: "DXOS",
        url: "https://dxos.org",
        maturity: "beta",
        license: "MIT",
        bestFor: "P2P collaborative apps with built-in identity",
        dims: {
          sync: "P2P (MESH)",
          conflict: "Automerge (ECHO)",
          identity: "Built-in (HALO)",
          ai: "Composer AI workflows"
        },
        details: {
          Schema: "TypeScript (ECHO)",
          "React hooks": "useQuery",
          "Type safety": "Full inference",
          Platforms: "Web + Electron",
          "Self-host": "P2P; optional agent infra",
          Encryption: "Encrypted P2P"
        },
        footnotes: ["dxos-composer"]
      },
      {
        name: "Evolu",
        url: "https://www.evolu.dev",
        maturity: "beta",
        license: "MIT",
        bestFor: "E2EE personal-data apps on SQLite",
        dims: {
          sync: "Relay server (self-hostable)",
          conflict: "CRDT (Evolu protocol)",
          identity: "Mnemonic-derived owner keys",
          ai: "—"
        },
        details: {
          Schema: "Typed SQL",
          "React hooks": "useQuery / useEvolu",
          "Type safety": "Full inference",
          Platforms: "Web, React Native, Electron",
          "Self-host": "Self-host relay",
          Encryption: "E2EE sync"
        }
      },
      {
        name: "RxDB",
        url: "https://rxdb.info",
        maturity: "production",
        license: "Apache-2.0 + premium plugins",
        bestFor: "Mature offline-first JS database with broad replication targets",
        dims: {
          sync: "Replication to many backends (CouchDB, GraphQL, Supabase, …)",
          conflict: "Revision-based; custom handlers; CRDT plugin",
          identity: "External",
          ai: "—"
        },
        details: {
          Schema: "JSON Schema",
          "React hooks": "Observables; React bindings",
          "Type safety": "TypeScript types",
          Platforms: "Browser, Node, RN, Capacitor, Electron",
          "Self-host": "Backend of your choice",
          Encryption: "Encryption plugin (at rest)"
        }
      },
      {
        name: "TinyBase",
        url: "https://tinybase.org",
        maturity: "production",
        license: "MIT",
        bestFor: "Tiny reactive local store with optional CRDT sync",
        dims: {
          sync: "MergeableStore sync; Yjs / Electric integrations",
          conflict: "Mergeable store (CRDT)",
          identity: "External",
          ai: "—"
        },
        details: {
          Schema: "Tabular + key-value (optional schemas)",
          "React hooks": "useTable / useValue + more",
          "Type safety": "TypeScript",
          Platforms: "Browser, Node, RN",
          "Self-host": "Optional WS sync server",
          Encryption: "App-defined"
        }
      },
      {
        name: "Fireproof",
        url: "https://fireproof.storage",
        maturity: "beta",
        license: "MIT / Apache-2.0",
        bestFor: "Drop-in embedded document DB for AI-generated apps",
        dims: {
          sync: "Encrypted live sync via gateways",
          conflict: "Merkle CRDTs",
          identity: "Connector-based",
          ai: "AI-first docs; Vibes DIY builder"
        },
        details: {
          Schema: "Schemaless JSON docs",
          "React hooks": "useLiveQuery / useDocument",
          "Type safety": "TypeScript",
          Platforms: "Browser, Node, edge",
          "Self-host": "Self-host gateway",
          Encryption: "Encrypted at rest + in sync"
        }
      },
      {
        name: "Convex",
        url: "https://convex.dev",
        maturity: "production",
        license: "FSL-Apache-2.0",
        bestFor: "Reactive cloud backend with strong DX (not local-first)",
        dims: {
          sync: "Server-authoritative reactive queries",
          conflict: "Server authority (transactions)",
          identity: "Convex Auth / external",
          ai: "AI Agent component + MCP server"
        },
        details: {
          Schema: "TypeScript",
          "React hooks": "useQuery",
          "Type safety": "Full inference",
          Platforms: "Web, React Native",
          "Self-host": "Self-host (Docker)",
          Encryption: "Cloud at-rest / TLS"
        },
        footnotes: ["cloud-baseline", "convex-fsl"]
      },
      {
        name: "InstantDB",
        url: "https://www.instantdb.com",
        maturity: "production",
        license: "Apache-2.0",
        bestFor: "Realtime relational backend with auth + presence",
        dims: {
          sync: "Server-authoritative; offline cache",
          conflict: "Server rebase (optimistic writes)",
          identity: "Built-in auth + permissions",
          ai: '"Backend for AI-coded apps"; hosted MCP server'
        },
        details: {
          Schema: "Schema-as-code",
          "React hooks": "useQuery (InstaQL)",
          "Type safety": "TypeScript",
          Platforms: "Web, React Native",
          "Self-host": "Possible (open source)",
          Encryption: "Cloud TLS"
        },
        footnotes: ["cloud-baseline"]
      }
    ],
    chips: [
      {
        name: "Verdant",
        url: "https://verdant.dev",
        note: "Solo-maintained IndexedDB local-first framework with relay sync"
      },
      {
        name: "GoatDB",
        url: "https://goatdb.dev",
        note: 'Git-like P2P document DB "for apps and agents"'
      },
      {
        name: "Basic.tech",
        url: "https://basic.tech",
        note: "Personal data stores platform (beta)"
      },
      {
        name: "WatermelonDB",
        url: "https://watermelondb.dev",
        note: "Offline-first React Native DB with sync adapters"
      },
      {
        name: "PouchDB",
        url: "https://pouchdb.com",
        note: "Classic CouchDB-replicating browser database"
      }
    ],
    footnotes: [
      {
        id: "fw-xnet-prerelease",
        text: "xNet is pre-release; rows reflect shipped behavior, not roadmap.",
        sourceUrl: "https://github.com/crs48/xNet"
      },
      {
        id: "ucan",
        text: "UCAN is community-stewarded since Fission, its original steward, wound down in 2024.",
        sourceUrl: "https://fission.codes/blog/farewell-from-fission/"
      },
      {
        id: "jazz-v2",
        text: "Jazz skipped 1.0: v2 (alpha) introduces a new API — partial table sync, durable streams, files.",
        sourceUrl: "https://jazz.tools"
      },
      {
        id: "triplit-velocity",
        text: "Triplit 1.0 shipped Mar 2025; release velocity has slowed since.",
        sourceUrl: "https://github.com/aspen-cloud/triplit/releases"
      },
      {
        id: "dxos-composer",
        text: "DXOS's flagship app Composer is explicitly not production-ready.",
        sourceUrl: "https://dxos.org"
      },
      {
        id: "cloud-baseline",
        text: "Included as a cloud-first baseline: server-authoritative rather than local-first, but commonly evaluated alongside these frameworks."
      },
      {
        id: "convex-fsl",
        text: "FSL-Apache-2.0: source-available, converts to Apache-2.0 after two years; self-hostable via Docker since Feb 2025.",
        sourceUrl: "https://news.convex.dev/convex-goes-open-source/"
      }
    ]
  },
  // ─── Layer 3: Sync engines & embedded databases ───────────────────────────
  {
    id: "sync",
    title: "Sync engines & embedded databases",
    shortTitle: "Sync engines",
    intro: "Engines and embedded databases that move data between clients and a backend. Some sync onto an existing Postgres/SQLite (Zero, Electric, PowerSync); others bring their own store (Turso, Ditto). xNet ships its own sync engine and store too — but you adopt it as a framework (above), not as a drop-in sync layer under an existing app. If you already have a database, these are the tools to evaluate.",
    lastVerified: "June 2026",
    columns: [
      { key: "license", label: "License" },
      { key: "source", label: "Source of truth" },
      { key: "offlineWrites", label: "Offline writes" },
      { key: "conflict", label: "Conflict model" },
      { key: "ai", label: "AI / agents" },
      { key: "bestFor", label: "Best for" }
    ],
    projects: [
      {
        name: "Zero",
        url: "https://zero.rocicorp.dev",
        maturity: "production",
        license: "Apache-2.0",
        bestFor: "Instant UI over an existing Postgres",
        dims: {
          source: "Postgres",
          offlineWrites: { v: "partial", fn: "zero-offline" },
          conflict: "Server rebase (custom mutators)",
          ai: "—"
        },
        details: {
          "Platforms / SDKs": "Web (React, others emerging)",
          Hosting: "Self-host (Docker) or your infra"
        },
        footnotes: ["zero-1-0"]
      },
      {
        name: "Electric",
        url: "https://electric.ax",
        maturity: "production",
        license: "Apache-2.0 (Electric Sync)",
        bestFor: "Streaming Postgres data into apps and agents",
        dims: {
          source: "Postgres (CDC, read-path)",
          offlineWrites: { v: "no", fn: "electric-writes" },
          conflict: "Server authority (your write API)",
          ai: "Electric Agents + Durable Streams"
        },
        details: {
          "Platforms / SDKs": "Any HTTP client; TanStack DB collection",
          Hosting: "Self-host or Electric Cloud"
        },
        footnotes: ["electric-pivot"]
      },
      {
        name: "PowerSync",
        url: "https://www.powersync.com",
        maturity: "production",
        license: "FSL-1.1 service / Apache-2.0 SDKs",
        bestFor: "Keeping in-app SQLite synced with existing databases",
        dims: {
          source: "Postgres, MongoDB, MySQL, SQL Server",
          offlineWrites: "yes",
          conflict: "Upload queue applied by your backend",
          ai: "—"
        },
        details: {
          "Platforms / SDKs": "Flutter, RN, web, Kotlin, Swift, .NET",
          Hosting: "Cloud or self-host"
        }
      },
      {
        name: "TanStack DB",
        url: "https://tanstack.com/db",
        maturity: "beta",
        license: "MIT",
        bestFor: "Reactive client store — the front door to several sync engines",
        dims: {
          source: "Pluggable collections (Electric, PowerSync, REST, …)",
          offlineWrites: { v: "yes", fn: "tanstack-offline" },
          conflict: "Optimistic mutations; backend-defined",
          ai: "—"
        },
        details: {
          "Platforms / SDKs": "Web (framework-agnostic; React bindings)",
          Hosting: "n/a (client library)"
        }
      },
      {
        name: "Turso",
        url: "https://turso.tech",
        maturity: "production",
        license: "MIT (database) + cloud service",
        bestFor: "SQLite everywhere with embedded replicas and cloud sync",
        dims: {
          source: "SQLite (embedded replicas)",
          offlineWrites: { v: "partial", fn: "turso-offline" },
          conflict: "Sync protocol (server primary)",
          ai: "Official MCP server"
        },
        details: {
          "Platforms / SDKs": "Rust core; JS, Rust, Go, Python SDKs",
          Hosting: "Turso Cloud; embedded"
        }
      },
      {
        name: "Ditto",
        url: "https://ditto.live",
        maturity: "production",
        license: "Proprietary",
        bestFor: "Offline mesh sync across BLE / LAN / cloud at the edge",
        dims: {
          source: "Ditto mesh (CRDT store)",
          offlineWrites: "yes",
          conflict: "CRDTs",
          ai: "—"
        },
        details: {
          "Platforms / SDKs": "iOS, Android, RN, Flutter, .NET, JS",
          Hosting: "Cloud (Big Peer); on-prem"
        }
      },
      {
        name: "Replicache",
        url: "https://replicache.dev",
        maturity: "maintenance",
        license: "Open source (free)",
        bestFor: "Proven sync pattern for existing backends (legacy choice)",
        dims: {
          source: "Your backend (push/pull endpoints)",
          offlineWrites: "yes",
          conflict: "Server rebase of mutations",
          ai: "—"
        },
        details: {
          "Platforms / SDKs": "Web",
          Hosting: "Your infra"
        },
        footnotes: ["replicache-maint"]
      }
    ],
    chips: [
      {
        name: "SQLite-Sync",
        url: "https://www.sqlite.ai/sqlite-sync",
        note: "CRDT extension for plain SQLite; agent-memory sync (Elastic 2.0)"
      },
      {
        name: "Dexie Cloud",
        url: "https://dexie.org/cloud/",
        note: "Commercial sync for Dexie.js / IndexedDB"
      },
      {
        name: "Graft",
        url: "https://github.com/orbitinghail/graft",
        note: "Page-level lazy replication; SQLite VFS (SQLSync successor)"
      },
      {
        name: "CR-SQLite",
        url: "https://vlcn.io",
        note: "CRDT extension making SQLite databases mergeable"
      },
      {
        name: "Cloudflare Agents",
        url: "https://developers.cloudflare.com/agents/",
        note: "Durable Objects realtime + per-agent SQLite (PartyKit lineage)"
      }
    ],
    footnotes: [
      {
        id: "zero-1-0",
        text: "Zero 1.0 — Rocicorp's first stable release — announced June 2026.",
        sourceUrl: "https://www.infoq.com/news/2026/06/zero-version-1/"
      },
      {
        id: "zero-offline",
        text: "Zero serves synced queries from a local cache with optimistic writes; full offline-first operation is not its design target.",
        sourceUrl: "https://zero.rocicorp.dev"
      },
      {
        id: "electric-writes",
        text: "Electric Sync is read-path replication; writes go through your own API (documented write patterns).",
        sourceUrl: "https://electric-sql.com/docs/guides/writes"
      },
      {
        id: "electric-pivot",
        text: 'ElectricSQL repositioned as "the agent platform built on sync" (Electric Agents, Durable Streams); Electric Sync remains the Apache-2.0 Postgres sync engine.',
        sourceUrl: "https://electric.ax"
      },
      {
        id: "tanstack-offline",
        text: "Persistence and offline support landed in TanStack DB 0.6 (Mar 2026).",
        sourceUrl: "https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes"
      },
      {
        id: "turso-offline",
        text: "Offline writes are in beta.",
        sourceUrl: "https://turso.tech/blog/introducing-offline-writes-for-turso"
      },
      {
        id: "replicache-maint",
        text: "Maintenance mode: free and open-sourced, no new features; Rocicorp recommends Zero for new projects.",
        sourceUrl: "https://replicache.dev"
      }
    ]
  },
  // ─── Layer 4: CRDT & collaboration substrates ─────────────────────────────
  {
    id: "substrates",
    title: "CRDT & collaboration substrates",
    shortTitle: "Substrates",
    intro: "CRDT libraries and collaboration infrastructure — building blocks rather than competitors. Most app frameworks above (including xNet) are built on one of these.",
    xnetNote: "xNet uses Yjs for rich text and collaborative state, paired with its own Lamport-clock LWW layer for structured data.",
    lastVerified: "June 2026",
    columns: [
      { key: "kind", label: "Kind" },
      { key: "license", label: "License" },
      { key: "dataTypes", label: "Data types" },
      { key: "network", label: "Network story" },
      { key: "bestFor", label: "Best for" }
    ],
    projects: [
      {
        name: "Yjs",
        url: "https://yjs.dev",
        maturity: "production",
        license: "MIT",
        bestFor: "The default CRDT for collaborative editors (used by xNet)",
        dims: {
          kind: "CRDT library",
          dataTypes: "Text, maps, arrays, XML",
          network: "Network-agnostic providers (WebRTC, WS)"
        }
      },
      {
        name: "Automerge",
        url: "https://automerge.org",
        maturity: "production",
        license: "MIT",
        bestFor: "Versioned local-first documents",
        dims: {
          kind: "CRDT library",
          dataTypes: "JSON-like docs + text",
          network: "automerge-repo (WS, BroadcastChannel)"
        },
        footnotes: ["automerge-3"]
      },
      {
        name: "Loro",
        url: "https://loro.dev",
        maturity: "production",
        license: "MIT",
        bestFor: "High-performance CRDTs with time travel",
        dims: {
          kind: "CRDT library (Rust + WASM)",
          dataTypes: "Rich text, movable trees, counters",
          network: "Network-agnostic"
        }
      },
      {
        name: "Y-Sweet",
        url: "https://jamsocket.com/y-sweet",
        maturity: "production",
        license: "MIT",
        bestFor: "Drop-in hosted or self-hosted Yjs backend",
        dims: {
          kind: "Yjs sync server",
          dataTypes: "Yjs documents",
          network: "WebSocket; S3-backed persistence"
        }
      },
      {
        name: "Liveblocks",
        url: "https://liveblocks.io",
        maturity: "production",
        license: "Proprietary",
        bestFor: "Adding multiplayer + AI copilots to SaaS apps",
        dims: {
          kind: "Collaboration SaaS",
          dataTypes: "Presence, storage, comments, text editors",
          network: "Managed cloud"
        }
      },
      {
        name: "Fluid Framework",
        url: "https://fluidframework.com",
        maturity: "production",
        license: "MIT",
        bestFor: "Microsoft-ecosystem realtime collaboration",
        dims: {
          kind: "Shared data structures + service",
          dataTypes: "Distributed data structures (SharedTree)",
          network: "Azure Fluid Relay / self-host"
        }
      }
    ],
    chips: [
      {
        name: "tldraw sync",
        url: "https://tldraw.dev",
        note: "Canvas SDK multiplayer backend; paid production license since SDK 4.0"
      },
      {
        name: "Excalidraw",
        url: "https://excalidraw.com",
        note: "MIT whiteboard with E2EE collab rooms"
      },
      {
        name: "Collabs",
        url: "https://collabs.readthedocs.io",
        note: "Composable CRDT library (CMU)"
      }
    ],
    footnotes: [
      {
        id: "automerge-3",
        text: "Automerge 3.0 (Jul 2025) cut memory use roughly 10x, making long-history documents practical.",
        sourceUrl: "https://automerge.org/blog/automerge-3/"
      }
    ]
  },
  // ─── Layer 5: Protocols & P2P primitives ──────────────────────────────────
  {
    id: "protocols",
    title: "Protocols & P2P primitives",
    shortTitle: "Protocols",
    intro: "Identity, transport, and federation primitives — the broader decentralized-data ecosystem. These are potential transports, identity systems, and federation peers rather than competitors.",
    xnetNote: "xNet both consumes and provides at this layer: it builds on WebRTC, DID:key and UCAN as primitives, and is itself a written, conformance-tested protocol (data model · replication · authorization) that anyone can re-implement — like AT Protocol or Matrix.",
    lastVerified: "July 2026",
    columns: [
      { key: "scope", label: "Scope" },
      { key: "dataModel", label: "Data model" },
      { key: "sync", label: "Sync" },
      { key: "identity", label: "Identity" },
      { key: "bestFor", label: "Best for" }
    ],
    projects: [
      {
        name: "xNet",
        url: "https://github.com/crs48/xNet",
        highlight: true,
        maturity: "pre-release",
        license: "MIT",
        bestFor: "Owning a typed knowledge graph — protocol separate from any one app",
        dims: {
          scope: "App + data protocol",
          dataModel: { v: "Signed, hash-chained LWW change log", fn: "xnet-kernel" },
          sync: "WebRTC / WebSocket; libp2p-capable; optional Hub relay",
          identity: "DID:key + UCAN"
        },
        footnotes: ["xnet-kernel"]
      },
      {
        name: "AT Protocol",
        url: "https://atproto.com",
        maturity: "production",
        license: "MIT / Apache-2.0",
        bestFor: "Bluesky-style social apps",
        dims: {
          scope: "Social protocol",
          dataModel: "Signed repos (Lexicons)",
          sync: "Federated relays",
          identity: "DID:plc"
        }
      },
      {
        name: "Habitat",
        url: "https://habitat.network",
        maturity: "pre-release",
        license: "Apache-2.0",
        bestFor: "Orgs wanting one trusted server for all app data",
        dims: {
          scope: "Org data server (atproto adaptation)",
          dataModel: "atproto records (Lexicons), private-only repos",
          sync: "Org-wide event stream (SSE) + backfill crawler",
          identity: { v: "DID:web, org-minted", fn: "habitat-ods" }
        },
        footnotes: ["habitat-ods"]
      },
      {
        name: "Nostr",
        url: "https://nostr.com",
        maturity: "production",
        license: "Open (public-domain spec)",
        bestFor: "Censorship-resistant social + payments",
        dims: {
          scope: "Event protocol",
          dataModel: "Signed JSON events",
          sync: "Relays (WebSocket)",
          identity: "secp256k1 keys"
        }
      },
      {
        name: "ActivityPub",
        url: "https://www.w3.org/TR/activitypub/",
        maturity: "production",
        license: "W3C Recommendation",
        bestFor: "Fediverse interop (Mastodon et al.)",
        dims: {
          scope: "Federation protocol",
          dataModel: "ActivityStreams (JSON-LD)",
          sync: "Server-to-server federation",
          identity: "HTTPS actors"
        }
      },
      {
        name: "Matrix",
        url: "https://matrix.org",
        maturity: "production",
        license: "Apache-2.0",
        bestFor: "Decentralized E2EE chat",
        dims: {
          scope: "Comms protocol",
          dataModel: "Event DAG per room",
          sync: "Federated homeservers",
          identity: "MXIDs + cross-signing"
        }
      },
      {
        name: "Hypercore / Pear",
        url: "https://pears.com",
        maturity: "production",
        license: "Apache-2.0",
        bestFor: "P2P apps + streaming",
        dims: {
          scope: "P2P runtime",
          dataModel: "Append-only logs",
          sync: "P2P (DHT)",
          identity: "Public keys"
        }
      },
      {
        name: "Iroh",
        url: "https://iroh.computer",
        maturity: "beta",
        license: "MIT / Apache-2.0",
        bestFor: "Reliable direct connections between devices",
        dims: {
          scope: "Networking library",
          dataModel: "Content-addressed blobs",
          sync: "P2P (QUIC, hole-punching)",
          identity: "Public keys"
        },
        footnotes: ["iroh-1-0"]
      },
      {
        name: "libp2p",
        url: "https://libp2p.io",
        maturity: "production",
        license: "MIT / Apache-2.0",
        bestFor: "Composable P2P transports (IPFS, Ethereum)",
        dims: {
          scope: "P2P networking stack",
          dataModel: "Transport-agnostic streams",
          sync: "Pubsub, DHT",
          identity: "Peer IDs (keys)"
        }
      },
      {
        name: "IPFS",
        url: "https://ipfs.tech",
        maturity: "production",
        license: "MIT / Apache-2.0",
        bestFor: "Content-addressed distribution",
        dims: {
          scope: "Content addressing",
          dataModel: "Merkle DAGs (CIDs)",
          sync: "DHT + gateways",
          identity: "Peer keys / CIDs"
        }
      },
      {
        name: "Willow",
        url: "https://willowprotocol.org",
        maturity: "alpha",
        license: "Open spec + JS/Rust impls",
        bestFor: "Fine-grained partial sync + capabilities",
        dims: {
          scope: "Sync protocol spec",
          dataModel: "3D namespace (paths × authors × time)",
          sync: "Range-based reconciliation",
          identity: "Meadowcap capabilities"
        }
      },
      {
        name: "Holochain",
        url: "https://holochain.org",
        maturity: "beta",
        license: "Cryptographic Autonomy License",
        bestFor: "Agent-centric distributed apps",
        dims: {
          scope: "Agent framework",
          dataModel: "Agent chains + DHT",
          sync: "DHT gossip + validation",
          identity: "Agent keys"
        }
      }
    ],
    chips: [
      {
        name: "p2panda",
        url: "https://p2panda.org",
        note: "Rust toolkit for encrypted group P2P apps"
      },
      { name: "Solid", url: "https://solidproject.org", note: "RDF data pods (WebID)" },
      {
        name: "Earthstar",
        url: "https://earthstar-project.org",
        note: "Private offline-first databases (Willow-aligned)"
      },
      { name: "OrbitDB", url: "https://orbitdb.org", note: "P2P database over IPFS" },
      {
        name: "Secure Scuttlebutt",
        url: "https://scuttlebutt.nz",
        note: "Historic P2P social protocol"
      },
      { name: "GunDB", url: "https://gun.eco", note: "Realtime decentralized graph database" },
      { name: "Ceramic", url: "https://ceramic.network", note: "Web3 identity / data network" },
      { name: "Farcaster", url: "https://www.farcaster.xyz", note: "Crypto-native social protocol" }
    ],
    footnotes: [
      {
        id: "xnet-kernel",
        text: "xNet's interop kernel is a signed, hash-chained, last-write-wins change log over schema-typed nodes (not Yjs, which travels as an opaque document body). A normative spec ships with a language-agnostic conformance corpus and a reference Python kernel. Hub-to-hub federation is on the roadmap, not yet shipped.",
        sourceUrl: "https://github.com/crs48/xNet/tree/main/docs/specs/protocol"
      },
      {
        id: "habitat-ods",
        text: "Habitat's Organizational Data Server hosts all member repositories on one org-owned server; member DIDs are minted by the org, and an OAuth credential for the org's DID can read every space on it. Access control is enforced at the server API, not by encryption — the inverse of xNet's hub, which never sees plaintext but also never gets a master read credential. Implements the draft atproto permissioned-spaces proposal (0016); pre-1.0 with breaking changes and a spaces→PDS migration announced.",
        sourceUrl: "https://github.com/habitat-network/habitat/blob/master/api-docs/docs/building/auth.mdx"
      },
      {
        id: "iroh-1-0",
        text: "1.0 release candidates published; the final 1.0 was not yet confirmed at the time of writing.",
        sourceUrl: "https://www.iroh.computer/blog/road-to-1-0"
      }
    ]
  }
];
const rowCount = layers.reduce((n, l) => n + l.projects.length, 0);
const chipCount = layers.reduce((n, l) => n + l.chips.length, 0);

export { chipCount as c, layers as l, rowCount as r, updated as u };
