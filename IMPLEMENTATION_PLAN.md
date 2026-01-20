# xNotes Implementation Plan
## A Decentralized Collaborative Productivity Platform

**Version**: 1.0
**Date**: January 2026
**Document Type**: Technical Implementation Plan

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Phase 1: Core Wiki & Task Manager (Months 0-12)](#phase-1-core-wiki--task-manager-months-0-12)
3. [Phase 2: Full Database UI (Months 12-24)](#phase-2-full-database-ui-months-12-24)
4. [Phase 3: Open-Source ERP Platform (Months 24+)](#phase-3-open-source-erp-platform-months-24)
5. [Engineering Best Practices](#engineering-best-practices)
6. [Monetization & Adoption Strategy](#monetization--adoption-strategy)
7. [Appendix](#appendix)

---

## Executive Summary

### Vision Statement

xNotes is the flagship application of the xNet decentralized internet ecosystem—a local-first, peer-to-peer collaborative productivity platform that evolves from a simple wiki and task manager into a fully customizable ERP system. By eliminating central servers, xNotes gives users complete ownership of their data while enabling real-time collaboration through CRDT-based synchronization.

### Strategic Positioning

| Aspect | Traditional Apps (Notion, Asana) | xNotes |
|--------|----------------------------------|--------|
| Data Storage | Centralized servers | Local-first, user devices |
| Privacy | Vendor has access | E2E encrypted, user-controlled |
| Offline Support | Limited | Full functionality |
| Vendor Lock-in | High | Zero (open formats) |
| Customization | Limited | Fully extensible |
| Cost | Recurring SaaS fees | Free/self-hosted |

### Technology Stack Rationale

```
┌─────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                        │
├─────────────────────────────────────────────────────────────────┤
│  React 18+ │ TypeScript 5+ │ TailwindCSS │ Radix UI Primitives │
├─────────────────────────────────────────────────────────────────┤
│                         STATE & EDITORS                         │
├─────────────────────────────────────────────────────────────────┤
│    Zustand (State)    │   Tiptap/ProseMirror   │   React DnD   │
├─────────────────────────────────────────────────────────────────┤
│                          DATA LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│   Yjs (CRDT)   │   IndexedDB   │   JSON-LD Schema   │   Lunr   │
├─────────────────────────────────────────────────────────────────┤
│                        NETWORK LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│     libp2p     │     WebRTC     │    y-webrtc    │   y-indexeddb│
├─────────────────────────────────────────────────────────────────┤
│                        SECURITY LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│   DID/SSI    │   libsodium   │   zk-SNARKs (future)   │  UCAN   │
├─────────────────────────────────────────────────────────────────┤
│                       DEPLOYMENT TARGETS                        │
├─────────────────────────────────────────────────────────────────┤
│       PWA (Web)       │       Electron       │      Tauri      │
└─────────────────────────────────────────────────────────────────┘
```

**Why These Choices:**

- **React + TypeScript**: Industry standard, massive ecosystem, strong typing for complex data models
- **Zustand over Redux/MobX**: Simpler API, better TypeScript support, less boilerplate, React 18 concurrent features compatible
- **Tiptap over Slate**: Built on ProseMirror (battle-tested), excellent Yjs integration, rich plugin ecosystem
- **Yjs over Automerge**: Better performance for text editing, mature WebRTC integration, smaller bundle size
- **libp2p**: The standard for decentralized networking, used by IPFS/Filecoin, modular transport layer
- **Tauri over Electron**: 10x smaller binary, better security model, native performance

### Resource Estimates

#### Team Structure (Initial: 5-10 developers)

| Role | Count | Phase 1 Focus |
|------|-------|---------------|
| Tech Lead / Architect | 1 | System design, P2P infrastructure |
| Senior Frontend Engineers | 2 | React components, editor integration |
| Backend/P2P Engineers | 2 | libp2p, sync protocols, IndexedDB |
| Full-Stack Engineers | 2-3 | Features end-to-end |
| DevOps / Security | 1 | CI/CD, security audits |
| Product / UX Designer | 1 | User research, design system |

#### Budget Estimates (USD)

| Category | Phase 1 (12 mo) | Phase 2 (12 mo) | Phase 3 (12+ mo) |
|----------|-----------------|-----------------|------------------|
| Personnel (avg $150k/yr) | $1.2M - $1.5M | $1.8M - $2.4M | $3M+ |
| Infrastructure & Tools | $50k | $100k | $200k |
| Security Audits | $50k | $100k | $150k |
| Marketing & Community | $100k | $200k | $500k |
| Contingency (15%) | $210k | $360k | $580k |
| **Total** | **$1.6M - $1.9M** | **$2.6M - $3.2M** | **$4.4M+** |

### Success Metrics

| Phase | Primary Metric | Target |
|-------|---------------|--------|
| 1 | Monthly Active Users | 50,000 |
| 2 | Daily Active Users | 100,000 |
| 3 | Enterprise Deployments | 500+ |

---

## Phase 1: Core Wiki & Task Manager (Months 0-12)

### 1.1 Feature Specifications

#### Wiki Module

**User Stories:**

```
US-1.1: As a user, I can create hierarchical pages with rich text content
US-1.2: As a user, I can link between pages using [[wikilinks]] syntax
US-1.3: As a user, I can see all backlinks to the current page
US-1.4: As a user, I can search across all my pages with full-text search
US-1.5: As a user, I can embed content from other pages
US-1.6: As a user, I can view version history and restore previous versions
US-1.7: As a collaborator, I can see real-time edits from other users
US-1.8: As a user, I can work offline and sync when reconnected
```

**Feature Matrix:**

| Feature | Priority | Complexity | Sprint |
|---------|----------|------------|--------|
| Rich text editor with markdown | P0 | High | 1-3 |
| Page hierarchy (tree view) | P0 | Medium | 2-3 |
| Wikilinks with autocomplete | P0 | Medium | 4 |
| Backlinks panel | P1 | Low | 5 |
| Full-text search | P0 | High | 4-5 |
| Page embeds/transclusion | P1 | Medium | 6 |
| Version history | P1 | High | 7-8 |
| Real-time collaboration | P0 | Very High | 3-6 |
| Offline support | P0 | High | 2-4 |
| Export (Markdown, HTML, PDF) | P2 | Low | 9 |

#### Task Manager Module

**User Stories:**

```
US-2.1: As a user, I can create tasks with titles, descriptions, due dates
US-2.2: As a user, I can organize tasks into projects and lists
US-2.3: As a user, I can view tasks in Kanban board view
US-2.4: As a user, I can view tasks in calendar view
US-2.5: As a user, I can assign tasks to collaborators
US-2.6: As a user, I can set task priorities and labels
US-2.7: As a user, I can create subtasks and checklists
US-2.8: As a user, I can link tasks to wiki pages
US-2.9: As a user, I can receive reminders for due tasks
```

**Feature Matrix:**

| Feature | Priority | Complexity | Sprint |
|---------|----------|------------|--------|
| Task CRUD with properties | P0 | Medium | 5-6 |
| Project/list organization | P0 | Medium | 6 |
| Kanban board view | P0 | High | 7-8 |
| List view with sorting/filtering | P0 | Medium | 7 |
| Calendar view | P1 | High | 9-10 |
| Task assignments | P1 | Medium | 8 |
| Labels and priorities | P0 | Low | 6 |
| Subtasks/checklists | P1 | Medium | 9 |
| Wiki page linking | P1 | Low | 8 |
| Local notifications/reminders | P2 | Medium | 11 |

#### Collaboration Features

**User Stories:**

```
US-3.1: As a user, I can create a workspace and invite collaborators via link/key
US-3.2: As a collaborator, I can join a workspace using an invite
US-3.3: As a workspace admin, I can manage member permissions
US-3.4: As a user, I can see presence indicators (who's online)
US-3.5: As a user, I can see cursors of collaborators in real-time
US-3.6: As a user, all my data is end-to-end encrypted
```

### 1.2 Technical Implementation

#### Project Structure

```
xnotes/
├── packages/
│   ├── core/                    # Shared data models, utilities
│   │   ├── src/
│   │   │   ├── schema/          # JSON-LD schemas
│   │   │   ├── crdt/            # Yjs document bindings
│   │   │   ├── crypto/          # Encryption utilities
│   │   │   ├── search/          # Lunr.js integration
│   │   │   └── types/           # TypeScript types
│   │   └── package.json
│   │
│   ├── network/                 # P2P networking layer
│   │   ├── src/
│   │   │   ├── libp2p/          # libp2p node configuration
│   │   │   ├── sync/            # Sync protocols
│   │   │   ├── discovery/       # Peer discovery
│   │   │   └── signaling/       # WebRTC signaling
│   │   └── package.json
│   │
│   ├── storage/                 # Persistence layer
│   │   ├── src/
│   │   │   ├── indexeddb/       # IndexedDB adapter
│   │   │   ├── blob/            # Binary blob storage
│   │   │   └── backup/          # Export/import
│   │   └── package.json
│   │
│   ├── editor/                  # Rich text editor
│   │   ├── src/
│   │   │   ├── extensions/      # Tiptap extensions
│   │   │   ├── components/      # Editor UI components
│   │   │   └── collaboration/   # Real-time collab bindings
│   │   └── package.json
│   │
│   ├── ui/                      # Design system
│   │   ├── src/
│   │   │   ├── primitives/      # Base components
│   │   │   ├── patterns/        # Composite components
│   │   │   └── theme/           # Theme tokens
│   │   └── package.json
│   │
│   └── app/                     # Main application
│       ├── src/
│       │   ├── features/        # Feature modules
│       │   │   ├── wiki/
│       │   │   ├── tasks/
│       │   │   ├── workspace/
│       │   │   └── settings/
│       │   ├── stores/          # Zustand stores
│       │   ├── hooks/           # React hooks
│       │   ├── routes/          # Routing
│       │   └── main.tsx
│       └── package.json
│
├── apps/
│   ├── web/                     # PWA build
│   ├── desktop/                 # Tauri/Electron
│   └── mobile/                  # React Native (future)
│
├── tools/
│   ├── scripts/                 # Build scripts
│   └── generators/              # Code generators
│
├── docs/                        # Documentation
├── turbo.json                   # Turborepo config
├── pnpm-workspace.yaml
└── package.json
```

#### Data Model Architecture

**JSON-LD Block Schema:**

```typescript
// packages/core/src/schema/block.ts

import { z } from 'zod';

// Base block schema - all content is composed of blocks
export const BlockSchema = z.object({
  '@context': z.literal('https://xnet.io/schema/v1'),
  '@id': z.string().uuid(),          // Content-addressable ID
  '@type': z.enum([
    'Page', 'Task', 'Database', 'View',
    'Paragraph', 'Heading', 'List', 'Code',
    'Image', 'Embed', 'Table'
  ]),

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(),              // DID of creator

  // Hierarchy
  parent: z.string().uuid().nullable(),
  children: z.array(z.string().uuid()),

  // Content (CRDT-managed)
  content: z.any(),                   // Type-specific content

  // Permissions
  permissions: z.object({
    owner: z.string(),                // DID
    readers: z.array(z.string()),
    writers: z.array(z.string()),
  }),

  // Versioning
  version: z.number(),
  history: z.array(z.object({
    version: z.number(),
    timestamp: z.string().datetime(),
    author: z.string(),
    delta: z.any(),                   // CRDT operation
  })),
});

export type Block = z.infer<typeof BlockSchema>;

// Page-specific schema
export const PageSchema = BlockSchema.extend({
  '@type': z.literal('Page'),
  content: z.object({
    title: z.string(),
    icon: z.string().optional(),
    cover: z.string().optional(),
    body: z.any(),                    // Tiptap JSON or Yjs doc reference
  }),
  properties: z.object({
    tags: z.array(z.string()),
    aliases: z.array(z.string()),
  }),
  links: z.object({
    outgoing: z.array(z.string().uuid()),  // Pages this links to
    incoming: z.array(z.string().uuid()),  // Backlinks
  }),
});

// Task-specific schema
export const TaskSchema = BlockSchema.extend({
  '@type': z.literal('Task'),
  content: z.object({
    title: z.string(),
    description: z.any(),             // Rich text
    status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
    priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
    dueDate: z.string().datetime().nullable(),
    assignees: z.array(z.string()),   // DIDs
    labels: z.array(z.string()),
    checklist: z.array(z.object({
      id: z.string().uuid(),
      text: z.string(),
      completed: z.boolean(),
    })),
  }),
  linkedPages: z.array(z.string().uuid()),
});

export type Page = z.infer<typeof PageSchema>;
export type Task = z.infer<typeof TaskSchema>;
```

**Yjs Document Structure:**

```typescript
// packages/core/src/crdt/document.ts

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';

export class XNotesDocument {
  public readonly ydoc: Y.Doc;
  private persistence: IndexeddbPersistence | null = null;
  private networkProvider: WebrtcProvider | null = null;

  constructor(
    public readonly workspaceId: string,
    public readonly documentId: string
  ) {
    this.ydoc = new Y.Doc({
      guid: `${workspaceId}:${documentId}`,
    });
  }

  // Document structure
  get blocks(): Y.Map<any> {
    return this.ydoc.getMap('blocks');
  }

  get pages(): Y.Map<any> {
    return this.ydoc.getMap('pages');
  }

  get tasks(): Y.Map<any> {
    return this.ydoc.getMap('tasks');
  }

  get metadata(): Y.Map<any> {
    return this.ydoc.getMap('metadata');
  }

  // Page content stored as Yjs XML for rich text
  getPageContent(pageId: string): Y.XmlFragment {
    return this.ydoc.getXmlFragment(`page:${pageId}`);
  }

  // Initialize persistence
  async initPersistence(): Promise<void> {
    this.persistence = new IndexeddbPersistence(
      `xnotes:${this.workspaceId}:${this.documentId}`,
      this.ydoc
    );
    await this.persistence.whenSynced;
  }

  // Connect to P2P network
  connectNetwork(signalingServers: string[]): void {
    this.networkProvider = new WebrtcProvider(
      `xnotes:${this.workspaceId}`,
      this.ydoc,
      {
        signaling: signalingServers,
        password: null, // E2E encryption handled separately
        awareness: this.ydoc.awareness,
        maxConns: 20,
        filterBcConns: true,
      }
    );
  }

  // Awareness (presence/cursors)
  get awareness() {
    return this.networkProvider?.awareness;
  }

  setLocalState(state: { user: any; cursor?: any }) {
    this.awareness?.setLocalState(state);
  }

  onAwarenessChange(callback: (changes: any) => void) {
    this.awareness?.on('change', callback);
  }

  // Cleanup
  destroy(): void {
    this.networkProvider?.destroy();
    this.persistence?.destroy();
    this.ydoc.destroy();
  }
}
```

#### libp2p Network Configuration

```typescript
// packages/network/src/libp2p/node.ts

import { createLibp2p, Libp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';

export interface XNetNodeConfig {
  bootstrapNodes: string[];
  enableRelay: boolean;
  enableDHT: boolean;
}

export async function createXNetNode(config: XNetNodeConfig): Promise<Libp2p> {
  const node = await createLibp2p({
    // Transports
    transports: [
      webSockets({
        filter: (addrs) => addrs.filter(a =>
          a.toString().includes('/wss/') ||
          a.toString().includes('/ws/')
        ),
      }),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      }),
    ],

    // Connection encryption
    connectionEncrypters: [noise()],

    // Stream multiplexing
    streamMuxers: [yamux()],

    // Peer discovery
    peerDiscovery: [
      bootstrap({ list: config.bootstrapNodes }),
      pubsubPeerDiscovery({
        interval: 10000,
        topics: ['xnet:discovery'],
      }),
    ],

    // Services
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
        emitSelf: false,
        gossipIncoming: true,
        fallbackToFloodsub: true,
      }),
      ...(config.enableDHT && {
        dht: kadDHT({
          clientMode: true,
          validators: {},
          selectors: {},
        }),
      }),
    },

    // Connection manager
    connectionManager: {
      maxConnections: 50,
      minConnections: 5,
      autoDialConcurrency: 5,
    },
  });

  return node;
}

// Workspace sync protocol
export class WorkspaceSyncProtocol {
  private node: Libp2p;
  private workspaceId: string;
  private topic: string;

  constructor(node: Libp2p, workspaceId: string) {
    this.node = node;
    this.workspaceId = workspaceId;
    this.topic = `xnotes:workspace:${workspaceId}`;
  }

  async subscribe(handler: (message: Uint8Array, from: string) => void) {
    const pubsub = this.node.services.pubsub;

    pubsub.addEventListener('message', (evt) => {
      if (evt.detail.topic === this.topic) {
        handler(evt.detail.data, evt.detail.from.toString());
      }
    });

    await pubsub.subscribe(this.topic);
  }

  async broadcast(data: Uint8Array) {
    const pubsub = this.node.services.pubsub;
    await pubsub.publish(this.topic, data);
  }

  async unsubscribe() {
    const pubsub = this.node.services.pubsub;
    await pubsub.unsubscribe(this.topic);
  }
}
```

#### Editor Integration with Tiptap

```typescript
// packages/editor/src/extensions/wiki-link.ts

import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, any>;
  onNavigate: (pageId: string) => void;
  getPages: () => Array<{ id: string; title: string }>;
}

export const WikiLink = Mark.create<WikiLinkOptions>({
  name: 'wikiLink',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'wiki-link',
      },
      onNavigate: () => {},
      getPages: () => [],
    };
  },

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-page-id'),
        renderHTML: (attrs) => ({ 'data-page-id': attrs.pageId }),
      },
      title: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wiki-link]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-wiki-link': '',
        href: '#',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '[[',
        pluginKey: new PluginKey('wikiLinkSuggestion'),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: 'text',
                marks: [
                  {
                    type: this.name,
                    attrs: {
                      pageId: props.id,
                      title: props.title,
                    },
                  },
                ],
                text: props.title,
              },
            ])
            .run();
        },
        items: ({ query }) => {
          return this.options
            .getPages()
            .filter((page) =>
              page.title.toLowerCase().includes(query.toLowerCase())
            )
            .slice(0, 10);
        },
      }),
    ];
  },
});

// packages/editor/src/collaboration/yjs-binding.ts

import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCursor } from '@tiptap/extension-collaboration-cursor';

export function createCollaborativeEditor(
  element: HTMLElement,
  ydoc: Y.Doc,
  fragment: Y.XmlFragment,
  user: { name: string; color: string },
  extensions: any[] = []
): Editor {
  return new Editor({
    element,
    extensions: [
      ...extensions,
      Collaboration.configure({
        document: ydoc,
        fragment,
      }),
      CollaborationCursor.configure({
        provider: ydoc.awareness,
        user,
        render: (user) => {
          const cursor = document.createElement('span');
          cursor.classList.add('collaboration-cursor');
          cursor.style.borderColor = user.color;

          const label = document.createElement('span');
          label.classList.add('collaboration-cursor-label');
          label.style.backgroundColor = user.color;
          label.textContent = user.name;

          cursor.appendChild(label);
          return cursor;
        },
      }),
    ],
  });
}
```

#### Full-Text Search with Lunr.js

```typescript
// packages/core/src/search/index.ts

import lunr from 'lunr';
import { Block, Page, Task } from '../schema/block';

export class SearchIndex {
  private pageIndex: lunr.Index | null = null;
  private taskIndex: lunr.Index | null = null;
  private documents: Map<string, any> = new Map();

  // Build indices from documents
  buildIndices(pages: Page[], tasks: Task[]) {
    // Page index
    this.pageIndex = lunr(function () {
      this.ref('id');
      this.field('title', { boost: 10 });
      this.field('body', { boost: 5 });
      this.field('tags', { boost: 3 });

      pages.forEach((page) => {
        this.add({
          id: page['@id'],
          title: page.content.title,
          body: extractPlainText(page.content.body),
          tags: page.properties.tags.join(' '),
        });
      });
    });

    // Task index
    this.taskIndex = lunr(function () {
      this.ref('id');
      this.field('title', { boost: 10 });
      this.field('description', { boost: 5 });
      this.field('labels', { boost: 3 });

      tasks.forEach((task) => {
        this.add({
          id: task['@id'],
          title: task.content.title,
          description: extractPlainText(task.content.description),
          labels: task.content.labels.join(' '),
        });
      });
    });

    // Store documents for retrieval
    [...pages, ...tasks].forEach((doc) => {
      this.documents.set(doc['@id'], doc);
    });
  }

  // Search across all content
  search(
    query: string,
    options: { type?: 'page' | 'task' | 'all'; limit?: number } = {}
  ): SearchResult[] {
    const { type = 'all', limit = 20 } = options;
    const results: SearchResult[] = [];

    if ((type === 'all' || type === 'page') && this.pageIndex) {
      const pageResults = this.pageIndex.search(query);
      results.push(
        ...pageResults.map((r) => ({
          id: r.ref,
          type: 'page' as const,
          score: r.score,
          document: this.documents.get(r.ref),
        }))
      );
    }

    if ((type === 'all' || type === 'task') && this.taskIndex) {
      const taskResults = this.taskIndex.search(query);
      results.push(
        ...taskResults.map((r) => ({
          id: r.ref,
          type: 'task' as const,
          score: r.score,
          document: this.documents.get(r.ref),
        }))
      );
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Incremental update (for real-time)
  updateDocument(doc: Page | Task) {
    // Lunr doesn't support incremental updates natively
    // For MVP, we rebuild periodically or on-demand
    // Phase 2: Switch to MiniSearch or custom solution
    this.documents.set(doc['@id'], doc);
  }
}

interface SearchResult {
  id: string;
  type: 'page' | 'task';
  score: number;
  document: any;
}

function extractPlainText(content: any): string {
  // Extract plain text from Tiptap JSON
  if (!content) return '';
  if (typeof content === 'string') return content;

  let text = '';
  const traverse = (node: any) => {
    if (node.text) text += node.text + ' ';
    if (node.content) node.content.forEach(traverse);
  };
  traverse(content);
  return text.trim();
}
```

#### Encryption Layer

```typescript
// packages/core/src/crypto/encryption.ts

import _sodium from 'libsodium-wrappers';

let sodium: typeof _sodium;

export async function initCrypto(): Promise<void> {
  await _sodium.ready;
  sodium = _sodium;
}

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface EncryptedPayload {
  nonce: string;      // Base64
  ciphertext: string; // Base64
}

// Generate identity keypair (for DID)
export function generateIdentityKeyPair(): KeyPair {
  return sodium.crypto_sign_keypair();
}

// Generate encryption keypair
export function generateEncryptionKeyPair(): KeyPair {
  return sodium.crypto_box_keypair();
}

// Derive shared workspace key from user keys
export function deriveWorkspaceKey(
  workspaceId: string,
  masterKey: Uint8Array
): Uint8Array {
  return sodium.crypto_kdf_derive_from_key(
    32,
    1,
    workspaceId.slice(0, 8), // context (8 chars)
    masterKey
  );
}

// Symmetric encryption for workspace data
export function encryptSymmetric(
  plaintext: Uint8Array,
  key: Uint8Array
): EncryptedPayload {
  const nonce = sodium.randombytes_buf(
    sodium.crypto_secretbox_NONCEBYTES
  );
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);

  return {
    nonce: sodium.to_base64(nonce),
    ciphertext: sodium.to_base64(ciphertext),
  };
}

export function decryptSymmetric(
  payload: EncryptedPayload,
  key: Uint8Array
): Uint8Array {
  const nonce = sodium.from_base64(payload.nonce);
  const ciphertext = sodium.from_base64(payload.ciphertext);

  return sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
}

// Asymmetric encryption for key exchange
export function encryptAsymmetric(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): EncryptedPayload {
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy(
    plaintext,
    nonce,
    recipientPublicKey,
    senderSecretKey
  );

  return {
    nonce: sodium.to_base64(nonce),
    ciphertext: sodium.to_base64(ciphertext),
  };
}

export function decryptAsymmetric(
  payload: EncryptedPayload,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): Uint8Array {
  const nonce = sodium.from_base64(payload.nonce);
  const ciphertext = sodium.from_base64(payload.ciphertext);

  return sodium.crypto_box_open_easy(
    ciphertext,
    nonce,
    senderPublicKey,
    recipientSecretKey
  );
}

// Sign data (for authentication)
export function sign(
  message: Uint8Array,
  secretKey: Uint8Array
): Uint8Array {
  return sodium.crypto_sign_detached(message, secretKey);
}

export function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return sodium.crypto_sign_verify_detached(signature, message, publicKey);
}
```

### 1.3 Development Workflow

#### Sprint Structure (2-week sprints)

```
Sprint 1-2:   Project setup, design system, core data model
Sprint 3-4:   Basic editor with persistence, offline support
Sprint 5-6:   P2P sync foundation, real-time collaboration
Sprint 7-8:   Wiki features (links, backlinks, hierarchy)
Sprint 9-10:  Task manager core (CRUD, views)
Sprint 11-12: Kanban board, search integration
Sprint 13-14: Calendar view, assignments, permissions
Sprint 15-16: Version history, export, polish
Sprint 17-18: Security audit, performance optimization
Sprint 19-20: Beta testing, bug fixes
Sprint 21-22: Launch preparation, documentation
Sprint 23-24: Public release, monitoring
```

#### Testing Strategy

```typescript
// Example: P2P sync simulation test
// packages/network/__tests__/sync.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { XNotesDocument } from '@xnotes/core';
import { createMockNetwork, MockPeer } from './helpers/mock-network';

describe('P2P Sync', () => {
  let peers: MockPeer[];
  let docs: XNotesDocument[];

  beforeEach(async () => {
    // Create 3 peers with simulated network
    const network = createMockNetwork({ latency: 50, packetLoss: 0.01 });
    peers = await Promise.all([
      network.createPeer('peer-1'),
      network.createPeer('peer-2'),
      network.createPeer('peer-3'),
    ]);

    docs = peers.map(
      (p) => new XNotesDocument('workspace-1', 'doc-1')
    );

    // Connect docs to peers
    await Promise.all(
      docs.map((doc, i) => doc.connectToMockPeer(peers[i]))
    );
  });

  afterEach(() => {
    docs.forEach((d) => d.destroy());
  });

  it('should sync changes across all peers', async () => {
    // Peer 1 makes a change
    docs[0].pages.set('page-1', {
      '@id': 'page-1',
      '@type': 'Page',
      content: { title: 'Hello World' },
    });

    // Wait for propagation
    await waitForSync(docs, 100);

    // All peers should have the change
    expect(docs[1].pages.get('page-1')?.content.title).toBe('Hello World');
    expect(docs[2].pages.get('page-1')?.content.title).toBe('Hello World');
  });

  it('should handle concurrent edits without conflicts', async () => {
    // Both peers edit the same page simultaneously
    const content1 = docs[0].getPageContent('page-1');
    const content2 = docs[1].getPageContent('page-1');

    // Simulate concurrent typing
    content1.insert(0, 'Hello from peer 1! ');
    content2.insert(0, 'Hello from peer 2! ');

    await waitForSync(docs, 200);

    // Both edits should be preserved (CRDT merge)
    const finalContent0 = docs[0].getPageContent('page-1').toString();
    const finalContent1 = docs[1].getPageContent('page-1').toString();
    const finalContent2 = docs[2].getPageContent('page-1').toString();

    // All peers should have identical content
    expect(finalContent0).toBe(finalContent1);
    expect(finalContent1).toBe(finalContent2);

    // Both edits should be present
    expect(finalContent0).toContain('peer 1');
    expect(finalContent0).toContain('peer 2');
  });

  it('should handle network partitions gracefully', async () => {
    // Partition peer 3 from the network
    peers[2].disconnect();

    // Peer 1 and 2 make changes
    docs[0].pages.set('page-2', { title: 'New Page' });
    docs[1].pages.get('page-2').title = 'Updated Title';

    await waitForSync([docs[0], docs[1]], 100);

    // Peer 3 makes changes while offline
    docs[2].pages.set('page-3', { title: 'Offline Page' });

    // Reconnect peer 3
    peers[2].reconnect();
    await waitForSync(docs, 200);

    // All changes should be synced
    expect(docs[2].pages.get('page-2')?.title).toBe('Updated Title');
    expect(docs[0].pages.get('page-3')?.title).toBe('Offline Page');
    expect(docs[1].pages.get('page-3')?.title).toBe('Offline Page');
  });
});

async function waitForSync(docs: XNotesDocument[], ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  // Additional: wait for all update events to settle
}
```

#### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit
      - run: pnpm test:integration
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm playwright install --with-deps
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Build desktop (Tauri)
        run: pnpm -F @xnotes/desktop build
      - uses: actions/upload-artifact@v3
        with:
          name: web-build
          path: apps/web/dist/

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'xnotes'
          path: '.'
          format: 'HTML'
```

### 1.4 Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| P2P performance issues at scale | High | High | Implement relay fallback, optimize gossip protocol, use selective sync |
| WebRTC connection failures | Medium | Medium | Multiple STUN/TURN servers, fallback to WebSocket relay |
| CRDT merge edge cases | Medium | High | Extensive testing, formal verification for critical paths |
| Browser storage limits (IndexedDB) | Medium | Medium | Implement blob offloading, compression, smart pruning |
| User onboarding complexity | High | High | Progressive disclosure, "magic link" invites, guided tutorials |
| Discoverability (no central index) | High | Medium | Optional public directory, shared workspace discovery |
| Mobile browser limitations | Medium | Medium | Prioritize PWA features, plan native app for Phase 2 |

---

## Phase 2: Full Database UI (Months 12-24)

### 2.1 Feature Specifications

#### Database Module

**User Stories:**

```
US-4.1: As a user, I can create a database with custom properties (columns)
US-4.2: As a user, I can add properties of various types (text, number, date, select, multi-select, person, relation, formula, rollup)
US-4.3: As a user, I can view my database as a table
US-4.4: As a user, I can view my database as a Kanban board grouped by a select property
US-4.5: As a user, I can view my database as a gallery with card previews
US-4.6: As a user, I can view my database as a timeline/Gantt chart
US-4.7: As a user, I can view my database as a calendar by date property
US-4.8: As a user, I can create formulas to compute values from other properties
US-4.9: As a user, I can create rollup properties to aggregate related data
US-4.10: As a user, I can filter and sort any view by properties
US-4.11: As a user, I can create multiple views of the same database
US-4.12: As a user, I can link databases together with relation properties
```

**Property Types:**

| Type | Storage | Validation | Display |
|------|---------|------------|---------|
| Text | string | length limit | Inline editor |
| Number | number | min/max, format | Formatted display |
| Date | ISO string | range | Date picker |
| Date Range | [start, end] | start < end | Range picker |
| Select | string (option ID) | from options | Dropdown |
| Multi-Select | string[] | from options | Tag chips |
| Person | DID | workspace member | Avatar + name |
| Checkbox | boolean | - | Toggle |
| URL | string | URL validation | Link |
| Email | string | email validation | Mailto link |
| Phone | string | phone validation | Tel link |
| File | blob reference | size limit | File preview |
| Relation | block ID[] | valid blocks | Linked items |
| Formula | expression | syntax valid | Computed value |
| Rollup | aggregate config | valid relation | Aggregated value |
| Created Time | auto | - | Read-only |
| Last Edited | auto | - | Read-only |
| Created By | auto DID | - | Read-only |

### 2.2 Technical Implementation

#### Database Schema Extension

```typescript
// packages/core/src/schema/database.ts

import { z } from 'zod';
import { BlockSchema } from './block';

// Property definition schema
export const PropertyDefinitionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    config: z.object({
      maxLength: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal('number'),
    config: z.object({
      format: z.enum(['number', 'percent', 'currency', 'progress']),
      currency: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal('select'),
    config: z.object({
      options: z.array(z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
      })),
    }),
  }),
  z.object({
    type: z.literal('multi_select'),
    config: z.object({
      options: z.array(z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
      })),
    }),
  }),
  z.object({
    type: z.literal('date'),
    config: z.object({
      includeTime: z.boolean(),
      dateFormat: z.string(),
      timeFormat: z.enum(['12h', '24h']),
    }),
  }),
  z.object({
    type: z.literal('relation'),
    config: z.object({
      targetDatabaseId: z.string().uuid(),
      isReciprocal: z.boolean(),
      reciprocalPropertyId: z.string().uuid().optional(),
    }),
  }),
  z.object({
    type: z.literal('formula'),
    config: z.object({
      expression: z.string(),
      returnType: z.enum(['text', 'number', 'date', 'boolean']),
    }),
  }),
  z.object({
    type: z.literal('rollup'),
    config: z.object({
      relationPropertyId: z.string().uuid(),
      targetPropertyId: z.string().uuid(),
      aggregation: z.enum([
        'count', 'count_values', 'count_unique',
        'sum', 'average', 'median', 'min', 'max',
        'range', 'show_original', 'show_unique',
        'percent_empty', 'percent_not_empty',
      ]),
    }),
  }),
  // ... other types
]);

// Database view schema
export const ViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(['table', 'board', 'gallery', 'timeline', 'calendar', 'list']),

  // Visible properties and order
  properties: z.array(z.object({
    id: z.string().uuid(),
    visible: z.boolean(),
    width: z.number().optional(), // for table view
  })),

  // Filtering
  filter: z.object({
    operator: z.enum(['and', 'or']),
    conditions: z.array(z.object({
      propertyId: z.string().uuid(),
      operator: z.string(), // type-specific operators
      value: z.any(),
    })),
  }).optional(),

  // Sorting
  sorts: z.array(z.object({
    propertyId: z.string().uuid(),
    direction: z.enum(['asc', 'desc']),
  })),

  // View-specific config
  config: z.record(z.any()), // type-specific
});

// Full database schema
export const DatabaseSchema = BlockSchema.extend({
  '@type': z.literal('Database'),

  schema: z.object({
    properties: z.record(z.string().uuid(), PropertyDefinitionSchema),
    titlePropertyId: z.string().uuid(), // which property is the title
  }),

  views: z.array(ViewSchema),

  // Items are stored as separate blocks with this database as parent
  defaultView: z.string().uuid(),
});

// Database item (row) schema
export const DatabaseItemSchema = BlockSchema.extend({
  '@type': z.literal('DatabaseItem'),
  databaseId: z.string().uuid(),

  // Property values keyed by property ID
  properties: z.record(z.string().uuid(), z.any()),
});

export type PropertyDefinition = z.infer<typeof PropertyDefinitionSchema>;
export type View = z.infer<typeof ViewSchema>;
export type Database = z.infer<typeof DatabaseSchema>;
export type DatabaseItem = z.infer<typeof DatabaseItemSchema>;
```

#### Formula Engine

```typescript
// packages/core/src/database/formula-engine.ts

import { DatabaseItem, PropertyDefinition } from '../schema/database';

type FormulaValue = string | number | boolean | Date | null;

interface FormulaContext {
  item: DatabaseItem;
  getProperty: (name: string) => FormulaValue;
  getRelated: (relationProp: string) => DatabaseItem[];
}

// Tokenizer
enum TokenType {
  Number = 'NUMBER',
  String = 'STRING',
  Boolean = 'BOOLEAN',
  Identifier = 'IDENTIFIER',
  Operator = 'OPERATOR',
  Function = 'FUNCTION',
  LeftParen = 'LPAREN',
  RightParen = 'RPAREN',
  Comma = 'COMMA',
  Property = 'PROPERTY', // prop("Name")
}

interface Token {
  type: TokenType;
  value: string | number | boolean;
  position: number;
}

// Built-in functions
const FORMULA_FUNCTIONS: Record<string, (...args: FormulaValue[]) => FormulaValue> = {
  // Math
  abs: (n) => Math.abs(Number(n)),
  ceil: (n) => Math.ceil(Number(n)),
  floor: (n) => Math.floor(Number(n)),
  round: (n, decimals = 0) => {
    const factor = Math.pow(10, Number(decimals));
    return Math.round(Number(n) * factor) / factor;
  },
  min: (...args) => Math.min(...args.map(Number)),
  max: (...args) => Math.max(...args.map(Number)),
  sum: (...args) => args.reduce((a, b) => Number(a) + Number(b), 0),

  // String
  concat: (...args) => args.join(''),
  lower: (s) => String(s).toLowerCase(),
  upper: (s) => String(s).toUpperCase(),
  length: (s) => String(s).length,
  contains: (s, sub) => String(s).includes(String(sub)),
  replace: (s, from, to) => String(s).replace(String(from), String(to)),
  slice: (s, start, end) => String(s).slice(Number(start), end ? Number(end) : undefined),

  // Date
  now: () => new Date(),
  today: () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },
  dateAdd: (date, amount, unit) => {
    const d = new Date(date as Date);
    const amt = Number(amount);
    switch (unit) {
      case 'days': d.setDate(d.getDate() + amt); break;
      case 'weeks': d.setDate(d.getDate() + amt * 7); break;
      case 'months': d.setMonth(d.getMonth() + amt); break;
      case 'years': d.setFullYear(d.getFullYear() + amt); break;
    }
    return d;
  },
  dateBetween: (start, end, unit) => {
    const s = new Date(start as Date).getTime();
    const e = new Date(end as Date).getTime();
    const diff = e - s;
    switch (unit) {
      case 'days': return Math.floor(diff / (1000 * 60 * 60 * 24));
      case 'weeks': return Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
      case 'months': return Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
      case 'years': return Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
      default: return diff;
    }
  },
  formatDate: (date, format) => {
    // Simplified - use date-fns in real implementation
    return new Date(date as Date).toLocaleDateString();
  },

  // Logic
  if: (condition, then, else_) => condition ? then : else_,
  and: (...args) => args.every(Boolean),
  or: (...args) => args.some(Boolean),
  not: (a) => !a,
  empty: (a) => a === null || a === undefined || a === '',

  // Type conversion
  toNumber: (v) => Number(v),
  toString: (v) => String(v),
};

export class FormulaEngine {
  evaluate(expression: string, context: FormulaContext): FormulaValue {
    const tokens = this.tokenize(expression);
    const ast = this.parse(tokens);
    return this.evaluateAST(ast, context);
  }

  private tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    let pos = 0;

    while (pos < expression.length) {
      const char = expression[pos];

      // Skip whitespace
      if (/\s/.test(char)) {
        pos++;
        continue;
      }

      // Numbers
      if (/\d/.test(char)) {
        let num = '';
        while (pos < expression.length && /[\d.]/.test(expression[pos])) {
          num += expression[pos++];
        }
        tokens.push({ type: TokenType.Number, value: parseFloat(num), position: pos });
        continue;
      }

      // Strings
      if (char === '"' || char === "'") {
        const quote = char;
        let str = '';
        pos++; // skip opening quote
        while (pos < expression.length && expression[pos] !== quote) {
          if (expression[pos] === '\\') pos++; // escape
          str += expression[pos++];
        }
        pos++; // skip closing quote
        tokens.push({ type: TokenType.String, value: str, position: pos });
        continue;
      }

      // Property reference: prop("Name")
      if (expression.slice(pos, pos + 4) === 'prop') {
        pos += 4;
        // Skip to opening paren and quote
        while (expression[pos] !== '"' && expression[pos] !== "'") pos++;
        const quote = expression[pos++];
        let propName = '';
        while (expression[pos] !== quote) {
          propName += expression[pos++];
        }
        pos++; // skip closing quote
        pos++; // skip closing paren
        tokens.push({ type: TokenType.Property, value: propName, position: pos });
        continue;
      }

      // Identifiers (functions, true/false)
      if (/[a-zA-Z_]/.test(char)) {
        let ident = '';
        while (pos < expression.length && /[a-zA-Z0-9_]/.test(expression[pos])) {
          ident += expression[pos++];
        }
        if (ident === 'true' || ident === 'false') {
          tokens.push({ type: TokenType.Boolean, value: ident === 'true', position: pos });
        } else if (FORMULA_FUNCTIONS[ident.toLowerCase()]) {
          tokens.push({ type: TokenType.Function, value: ident.toLowerCase(), position: pos });
        } else {
          tokens.push({ type: TokenType.Identifier, value: ident, position: pos });
        }
        continue;
      }

      // Operators and punctuation
      const operators = ['==', '!=', '>=', '<=', '&&', '||', '+', '-', '*', '/', '%', '>', '<', '!'];
      const op = operators.find(o => expression.slice(pos, pos + o.length) === o);
      if (op) {
        tokens.push({ type: TokenType.Operator, value: op, position: pos });
        pos += op.length;
        continue;
      }

      if (char === '(') {
        tokens.push({ type: TokenType.LeftParen, value: '(', position: pos++ });
        continue;
      }
      if (char === ')') {
        tokens.push({ type: TokenType.RightParen, value: ')', position: pos++ });
        continue;
      }
      if (char === ',') {
        tokens.push({ type: TokenType.Comma, value: ',', position: pos++ });
        continue;
      }

      throw new Error(`Unexpected character: ${char} at position ${pos}`);
    }

    return tokens;
  }

  private parse(tokens: Token[]): ASTNode {
    // Recursive descent parser - simplified for example
    // Full implementation would handle operator precedence properly
    let pos = 0;

    const parseExpression = (): ASTNode => {
      return parseOr();
    };

    const parseOr = (): ASTNode => {
      let left = parseAnd();
      while (pos < tokens.length && tokens[pos].value === '||') {
        pos++;
        const right = parseAnd();
        left = { type: 'binary', operator: '||', left, right };
      }
      return left;
    };

    const parseAnd = (): ASTNode => {
      let left = parseComparison();
      while (pos < tokens.length && tokens[pos].value === '&&') {
        pos++;
        const right = parseComparison();
        left = { type: 'binary', operator: '&&', left, right };
      }
      return left;
    };

    const parseComparison = (): ASTNode => {
      let left = parseAdditive();
      const compOps = ['==', '!=', '>', '<', '>=', '<='];
      while (pos < tokens.length && compOps.includes(tokens[pos].value as string)) {
        const op = tokens[pos++].value as string;
        const right = parseAdditive();
        left = { type: 'binary', operator: op, left, right };
      }
      return left;
    };

    const parseAdditive = (): ASTNode => {
      let left = parseMultiplicative();
      while (pos < tokens.length && ['+', '-'].includes(tokens[pos].value as string)) {
        const op = tokens[pos++].value as string;
        const right = parseMultiplicative();
        left = { type: 'binary', operator: op, left, right };
      }
      return left;
    };

    const parseMultiplicative = (): ASTNode => {
      let left = parseUnary();
      while (pos < tokens.length && ['*', '/', '%'].includes(tokens[pos].value as string)) {
        const op = tokens[pos++].value as string;
        const right = parseUnary();
        left = { type: 'binary', operator: op, left, right };
      }
      return left;
    };

    const parseUnary = (): ASTNode => {
      if (tokens[pos]?.value === '!' || tokens[pos]?.value === '-') {
        const op = tokens[pos++].value as string;
        const operand = parseUnary();
        return { type: 'unary', operator: op, operand };
      }
      return parsePrimary();
    };

    const parsePrimary = (): ASTNode => {
      const token = tokens[pos];

      if (token.type === TokenType.Number ||
          token.type === TokenType.String ||
          token.type === TokenType.Boolean) {
        pos++;
        return { type: 'literal', value: token.value };
      }

      if (token.type === TokenType.Property) {
        pos++;
        return { type: 'property', name: token.value as string };
      }

      if (token.type === TokenType.Function) {
        const funcName = token.value as string;
        pos++; // function name
        pos++; // opening paren
        const args: ASTNode[] = [];
        while (tokens[pos].type !== TokenType.RightParen) {
          args.push(parseExpression());
          if (tokens[pos].type === TokenType.Comma) pos++;
        }
        pos++; // closing paren
        return { type: 'function', name: funcName, args };
      }

      if (token.type === TokenType.LeftParen) {
        pos++; // opening paren
        const expr = parseExpression();
        pos++; // closing paren
        return expr;
      }

      throw new Error(`Unexpected token: ${token.type} at position ${token.position}`);
    };

    return parseExpression();
  }

  private evaluateAST(node: ASTNode, context: FormulaContext): FormulaValue {
    switch (node.type) {
      case 'literal':
        return node.value;

      case 'property':
        return context.getProperty(node.name);

      case 'function':
        const args = node.args.map(arg => this.evaluateAST(arg, context));
        const func = FORMULA_FUNCTIONS[node.name];
        if (!func) throw new Error(`Unknown function: ${node.name}`);
        return func(...args);

      case 'binary': {
        const left = this.evaluateAST(node.left, context);
        const right = this.evaluateAST(node.right, context);
        switch (node.operator) {
          case '+': return Number(left) + Number(right);
          case '-': return Number(left) - Number(right);
          case '*': return Number(left) * Number(right);
          case '/': return Number(left) / Number(right);
          case '%': return Number(left) % Number(right);
          case '==': return left === right;
          case '!=': return left !== right;
          case '>': return Number(left) > Number(right);
          case '<': return Number(left) < Number(right);
          case '>=': return Number(left) >= Number(right);
          case '<=': return Number(left) <= Number(right);
          case '&&': return Boolean(left) && Boolean(right);
          case '||': return Boolean(left) || Boolean(right);
          default: throw new Error(`Unknown operator: ${node.operator}`);
        }
      }

      case 'unary': {
        const operand = this.evaluateAST(node.operand, context);
        switch (node.operator) {
          case '!': return !operand;
          case '-': return -Number(operand);
          default: throw new Error(`Unknown operator: ${node.operator}`);
        }
      }

      default:
        throw new Error(`Unknown node type`);
    }
  }
}

interface ASTNode {
  type: 'literal' | 'property' | 'function' | 'binary' | 'unary';
  value?: FormulaValue;
  name?: string;
  args?: ASTNode[];
  operator?: string;
  left?: ASTNode;
  right?: ASTNode;
  operand?: ASTNode;
}
```

#### Database View Components

```typescript
// packages/app/src/features/database/components/TableView.tsx

import React, { useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Database, DatabaseItem, View } from '@xnotes/core';
import { PropertyCell } from './PropertyCell';
import { PropertyHeader } from './PropertyHeader';

interface TableViewProps {
  database: Database;
  items: DatabaseItem[];
  view: View;
  onItemUpdate: (itemId: string, propertyId: string, value: any) => void;
  onPropertyAdd: () => void;
  onPropertyUpdate: (propertyId: string, updates: any) => void;
}

export function TableView({
  database,
  items,
  view,
  onItemUpdate,
  onPropertyAdd,
  onPropertyUpdate,
}: TableViewProps) {
  const [sorting, setSorting] = React.useState<SortingState>(
    view.sorts.map(s => ({ id: s.propertyId, desc: s.direction === 'desc' }))
  );

  // Build columns from database schema
  const columns = useMemo<ColumnDef<DatabaseItem>[]>(() => {
    const visibleProps = view.properties.filter(p => p.visible);

    return visibleProps.map(viewProp => {
      const propDef = database.schema.properties[viewProp.id];

      return {
        id: viewProp.id,
        accessorFn: (row) => row.properties[viewProp.id],
        header: ({ column }) => (
          <PropertyHeader
            property={propDef}
            propertyId={viewProp.id}
            column={column}
            onUpdate={(updates) => onPropertyUpdate(viewProp.id, updates)}
          />
        ),
        cell: ({ row, getValue }) => (
          <PropertyCell
            property={propDef}
            value={getValue()}
            onChange={(value) => onItemUpdate(row.original['@id'], viewProp.id, value)}
          />
        ),
        size: viewProp.width || 200,
        minSize: 100,
        maxSize: 500,
      };
    });
  }, [database.schema, view.properties, onItemUpdate, onPropertyUpdate]);

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Virtual scrolling for large datasets
  const parentRef = React.useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // row height
    overscan: 10,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div className="database-table-container">
      <div ref={parentRef} className="database-table-scroll">
        <table className="database-table">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="database-table-header"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
                <th className="database-table-header-add">
                  <button onClick={onPropertyAdd}>+</button>
                </th>
              </tr>
            ))}
          </thead>
          <tbody
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualRows.map(virtualRow => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    height: `${virtualRow.size}px`,
                  }}
                  className="database-table-row"
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="database-table-cell"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 2.3 Vector Database Integration

```typescript
// packages/core/src/vector/index.ts

import { HNSW } from 'hnsw';

interface VectorDocument {
  id: string;
  vector: Float32Array;
  metadata: Record<string, any>;
}

export class VectorIndex {
  private index: HNSW;
  private documents: Map<string, VectorDocument> = new Map();
  private dimension: number;

  constructor(dimension: number = 384) { // Default for MiniLM
    this.dimension = dimension;
    this.index = new HNSW({
      dimension,
      metric: 'cosine',
      maxElements: 100000,
      efConstruction: 200,
      M: 16,
    });
  }

  // Add document with embedding
  async add(doc: VectorDocument): Promise<void> {
    if (doc.vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${doc.vector.length}`);
    }

    this.documents.set(doc.id, doc);
    this.index.add(doc.id, doc.vector);
  }

  // Search for similar documents
  search(
    queryVector: Float32Array,
    k: number = 10,
    filter?: (doc: VectorDocument) => boolean
  ): Array<{ id: string; score: number; metadata: any }> {
    const results = this.index.search(queryVector, k * 2); // Over-fetch for filtering

    return results
      .map(r => {
        const doc = this.documents.get(r.id);
        return {
          id: r.id,
          score: r.score,
          metadata: doc?.metadata,
        };
      })
      .filter(r => !filter || filter(this.documents.get(r.id)!))
      .slice(0, k);
  }

  // Remove document
  remove(id: string): void {
    this.documents.delete(id);
    this.index.remove(id);
  }

  // Serialize for persistence
  serialize(): Uint8Array {
    return this.index.serialize();
  }

  // Deserialize from persistence
  static deserialize(data: Uint8Array, docs: VectorDocument[]): VectorIndex {
    const index = new VectorIndex();
    index.index = HNSW.deserialize(data);
    docs.forEach(doc => index.documents.set(doc.id, doc));
    return index;
  }
}

// On-device embedding generation using TensorFlow.js
import * as tf from '@tensorflow/tfjs';

export class EmbeddingModel {
  private model: tf.GraphModel | null = null;
  private tokenizer: any; // BERT tokenizer

  async load(): Promise<void> {
    // Load MiniLM or similar small model
    this.model = await tf.loadGraphModel(
      '/models/minilm-l6-v2/model.json'
    );
    // Load tokenizer
    // ... tokenizer initialization
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.model) throw new Error('Model not loaded');

    // Tokenize
    const tokens = this.tokenizer.encode(text, {
      maxLength: 512,
      padding: 'max_length',
      truncation: true,
    });

    // Create input tensors
    const inputIds = tf.tensor2d([tokens.ids], [1, 512], 'int32');
    const attentionMask = tf.tensor2d([tokens.attentionMask], [1, 512], 'int32');

    // Run inference
    const output = this.model.predict({
      input_ids: inputIds,
      attention_mask: attentionMask,
    }) as tf.Tensor;

    // Mean pooling
    const embeddings = output.mean(1);
    const result = await embeddings.data();

    // Cleanup
    inputIds.dispose();
    attentionMask.dispose();
    output.dispose();
    embeddings.dispose();

    return new Float32Array(result);
  }

  // Batch embedding for efficiency
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Process in batches of 8 for memory efficiency
    const batchSize = 8;
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await Promise.all(batch.map(t => this.embed(t)));
      results.push(...embeddings);
    }

    return results;
  }
}
```

### 2.4 Phase 2 Sprint Plan

```
Sprint 25-26:  Database schema design, property type system
Sprint 27-28:  Table view with TanStack Table, virtual scrolling
Sprint 29-30:  Property editors (date picker, select, relation)
Sprint 31-32:  Filter and sort system
Sprint 33-34:  Kanban board view (database-backed)
Sprint 35-36:  Gallery view, card templates
Sprint 37-38:  Timeline/Gantt view
Sprint 39-40:  Calendar view (database-backed)
Sprint 41-42:  Formula engine implementation
Sprint 43-44:  Rollup properties, relation linking
Sprint 45-46:  Vector index, semantic search
Sprint 47-48:  Performance optimization, caching
```

---

## Phase 3: Open-Source ERP Platform (Months 24+)

### 3.1 Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            xNotes ERP Platform                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                              CORE FRAMEWORK                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Module    │ │   Workflow  │ │  Dashboard  │ │    Plugin   │           │
│  │   System    │ │   Engine    │ │   Builder   │ │   Runtime   │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────────────────────┤
│                            BUSINESS MODULES                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │     CRM     │ │     HRM     │ │  Inventory  │ │   Finance   │           │
│  │ Contacts    │ │ Employees   │ │ Products    │ │ Invoicing   │           │
│  │ Deals       │ │ Recruiting  │ │ Warehouses  │ │ Expenses    │           │
│  │ Campaigns   │ │ Payroll     │ │ Orders      │ │ Budgets     │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Project   │ │Supply Chain │ │  Analytics  │ │   Custom    │           │
│  │ Management  │ │ Procurement │ │ Dashboards  │ │  Modules    │           │
│  │ Resources   │ │ Suppliers   │ │ Reports     │ │  (Plugins)  │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────────────────────┤
│                          INTEGRATION LAYER                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  REST API   │ │  Webhooks   │ │   OAuth     │ │   Legacy    │           │
│  │  Gateway    │ │   System    │ │   Bridge    │ │   Adapter   │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Module System

```typescript
// packages/core/src/modules/types.ts

export interface ModuleDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;

  // Dependencies
  dependencies: {
    core: string;          // Minimum core version
    modules: string[];     // Other required modules
    libraries: Record<string, string>; // npm packages
  };

  // Data model extensions
  schema: {
    databases: DatabaseTemplate[];
    relations: RelationTemplate[];
  };

  // UI components
  components: {
    pages: PageComponent[];
    widgets: WidgetComponent[];
    actions: ActionComponent[];
  };

  // Workflows and automations
  workflows: WorkflowTemplate[];

  // API extensions
  api: {
    endpoints: APIEndpoint[];
    webhooks: WebhookTemplate[];
  };

  // Permissions
  permissions: Permission[];

  // Settings
  settings: SettingDefinition[];

  // Lifecycle hooks
  hooks: {
    onInstall?: () => Promise<void>;
    onUninstall?: () => Promise<void>;
    onUpgrade?: (fromVersion: string) => Promise<void>;
    onEnable?: () => Promise<void>;
    onDisable?: () => Promise<void>;
  };
}

// Example: CRM Module Definition
export const CRMModule: ModuleDefinition = {
  id: 'xnotes.crm',
  name: 'CRM',
  version: '1.0.0',
  description: 'Customer Relationship Management',
  author: 'xNet Team',
  license: 'MIT',

  dependencies: {
    core: '^2.0.0',
    modules: [],
    libraries: {},
  },

  schema: {
    databases: [
      {
        id: 'contacts',
        name: 'Contacts',
        icon: 'users',
        properties: [
          { id: 'name', type: 'text', required: true },
          { id: 'email', type: 'email' },
          { id: 'phone', type: 'phone' },
          { id: 'company', type: 'relation', target: 'companies' },
          { id: 'status', type: 'select', options: ['Lead', 'Prospect', 'Customer', 'Churned'] },
          { id: 'value', type: 'number', format: 'currency' },
          { id: 'lastContact', type: 'date' },
          { id: 'owner', type: 'person' },
          { id: 'tags', type: 'multi_select' },
        ],
        defaultView: 'table',
      },
      {
        id: 'companies',
        name: 'Companies',
        icon: 'building',
        properties: [
          { id: 'name', type: 'text', required: true },
          { id: 'domain', type: 'url' },
          { id: 'industry', type: 'select' },
          { id: 'size', type: 'select', options: ['1-10', '11-50', '51-200', '201-1000', '1000+'] },
          { id: 'contacts', type: 'relation', target: 'contacts', reciprocal: true },
          { id: 'deals', type: 'relation', target: 'deals' },
        ],
      },
      {
        id: 'deals',
        name: 'Deals',
        icon: 'dollar-sign',
        properties: [
          { id: 'name', type: 'text', required: true },
          { id: 'value', type: 'number', format: 'currency' },
          { id: 'stage', type: 'select', options: ['Discovery', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'] },
          { id: 'probability', type: 'number', format: 'percent' },
          { id: 'expectedClose', type: 'date' },
          { id: 'company', type: 'relation', target: 'companies' },
          { id: 'contact', type: 'relation', target: 'contacts' },
          { id: 'owner', type: 'person' },
          { id: 'weightedValue', type: 'formula', expression: 'prop("value") * prop("probability") / 100' },
        ],
        defaultView: 'board',
        defaultGroupBy: 'stage',
      },
    ],
    relations: [
      { from: 'contacts', to: 'companies', type: 'many-to-one' },
      { from: 'deals', to: 'companies', type: 'many-to-one' },
      { from: 'deals', to: 'contacts', type: 'many-to-one' },
    ],
  },

  components: {
    pages: [
      {
        id: 'crm-dashboard',
        name: 'CRM Dashboard',
        path: '/crm',
        component: 'CRMDashboard',
      },
      {
        id: 'pipeline',
        name: 'Pipeline',
        path: '/crm/pipeline',
        component: 'PipelineView',
      },
    ],
    widgets: [
      {
        id: 'deal-funnel',
        name: 'Deal Funnel',
        component: 'DealFunnel',
        configSchema: { /* ... */ },
      },
      {
        id: 'revenue-forecast',
        name: 'Revenue Forecast',
        component: 'RevenueForecast',
      },
    ],
    actions: [
      {
        id: 'send-email',
        name: 'Send Email',
        icon: 'mail',
        handler: 'sendEmail',
        contexts: ['contact', 'company'],
      },
    ],
  },

  workflows: [
    {
      id: 'deal-stage-notification',
      name: 'Deal Stage Change Notification',
      trigger: {
        type: 'property_change',
        database: 'deals',
        property: 'stage',
      },
      actions: [
        {
          type: 'notification',
          config: {
            to: '{{owner}}',
            title: 'Deal moved to {{stage}}',
            body: '{{name}} has moved to {{stage}}',
          },
        },
      ],
    },
  ],

  api: {
    endpoints: [],
    webhooks: [],
  },

  permissions: [
    { id: 'crm.view', name: 'View CRM', description: 'View contacts, companies, deals' },
    { id: 'crm.edit', name: 'Edit CRM', description: 'Create and edit CRM records' },
    { id: 'crm.delete', name: 'Delete CRM', description: 'Delete CRM records' },
    { id: 'crm.admin', name: 'CRM Admin', description: 'Manage CRM settings' },
  ],

  settings: [
    {
      id: 'currency',
      name: 'Default Currency',
      type: 'select',
      options: ['USD', 'EUR', 'GBP', 'JPY'],
      default: 'USD',
    },
    {
      id: 'fiscalYearStart',
      name: 'Fiscal Year Start',
      type: 'select',
      options: ['January', 'April', 'July', 'October'],
      default: 'January',
    },
  ],

  hooks: {
    async onInstall() {
      // Create default databases and views
    },
  },
};
```

### 3.3 Workflow Engine

```typescript
// packages/core/src/workflow/engine.ts

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'property_change' | 'record_create' | 'record_delete' | 'webhook';
  config: Record<string, any>;
}

export interface WorkflowAction {
  type: 'update_record' | 'create_record' | 'delete_record' |
        'send_notification' | 'send_email' | 'call_webhook' |
        'run_script' | 'conditional';
  config: Record<string, any>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];
}

export class WorkflowEngine {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private running: Map<string, WorkflowExecution> = new Map();

  // Register workflow
  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);

    // Set up trigger listeners
    if (workflow.enabled) {
      this.setupTrigger(workflow);
    }
  }

  // Execute workflow
  async execute(
    workflowId: string,
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const execution: WorkflowExecution = {
      id: crypto.randomUUID(),
      workflowId,
      status: 'running',
      startedAt: new Date(),
      context,
      steps: [],
    };

    this.running.set(execution.id, execution);

    try {
      // Check conditions
      if (workflow.conditions) {
        const conditionsMet = await this.evaluateConditions(
          workflow.conditions,
          context
        );
        if (!conditionsMet) {
          execution.status = 'skipped';
          execution.completedAt = new Date();
          return { success: true, execution };
        }
      }

      // Execute actions sequentially
      for (const action of workflow.actions) {
        const stepResult = await this.executeAction(action, context);
        execution.steps.push(stepResult);

        if (!stepResult.success) {
          execution.status = 'failed';
          execution.error = stepResult.error;
          break;
        }

        // Update context with action results
        context = { ...context, ...stepResult.outputs };
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
      }

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
    }

    execution.completedAt = new Date();
    this.running.delete(execution.id);

    // Store execution history
    await this.storeExecution(execution);

    return { success: execution.status === 'completed', execution };
  }

  private async executeAction(
    action: WorkflowAction,
    context: WorkflowContext
  ): Promise<StepResult> {
    const startedAt = new Date();

    try {
      let outputs: Record<string, any> = {};

      switch (action.type) {
        case 'update_record': {
          const { databaseId, recordId, properties } = action.config;
          const resolvedProps = this.resolveTemplates(properties, context);
          await this.updateRecord(databaseId, recordId, resolvedProps);
          break;
        }

        case 'create_record': {
          const { databaseId, properties } = action.config;
          const resolvedProps = this.resolveTemplates(properties, context);
          const newRecord = await this.createRecord(databaseId, resolvedProps);
          outputs.createdRecordId = newRecord.id;
          break;
        }

        case 'send_notification': {
          const { to, title, body } = action.config;
          const resolvedTo = this.resolveTemplate(to, context);
          const resolvedTitle = this.resolveTemplate(title, context);
          const resolvedBody = this.resolveTemplate(body, context);
          await this.sendNotification(resolvedTo, resolvedTitle, resolvedBody);
          break;
        }

        case 'call_webhook': {
          const { url, method, headers, body } = action.config;
          const resolvedUrl = this.resolveTemplate(url, context);
          const resolvedBody = this.resolveTemplates(body, context);
          const response = await this.callWebhook(resolvedUrl, method, headers, resolvedBody);
          outputs.webhookResponse = response;
          break;
        }

        case 'conditional': {
          const { condition, thenActions, elseActions } = action.config;
          const result = await this.evaluateCondition(condition, context);
          const actionsToRun = result ? thenActions : elseActions;

          for (const subAction of actionsToRun || []) {
            const subResult = await this.executeAction(subAction, context);
            if (!subResult.success) {
              return subResult;
            }
            outputs = { ...outputs, ...subResult.outputs };
          }
          break;
        }

        case 'run_script': {
          const { code } = action.config;
          outputs = await this.runSandboxedScript(code, context);
          break;
        }
      }

      return {
        action: action.type,
        success: true,
        startedAt,
        completedAt: new Date(),
        outputs,
      };

    } catch (error) {
      return {
        action: action.type,
        success: false,
        startedAt,
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        outputs: {},
      };
    }
  }

  // Template resolution: {{property}} syntax
  private resolveTemplate(template: string, context: WorkflowContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return context[key]?.toString() ?? '';
    });
  }

  private resolveTemplates(obj: any, context: WorkflowContext): any {
    if (typeof obj === 'string') {
      return this.resolveTemplate(obj, context);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveTemplates(item, context));
    }
    if (typeof obj === 'object' && obj !== null) {
      const resolved: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveTemplates(value, context);
      }
      return resolved;
    }
    return obj;
  }

  // Sandboxed script execution (Web Workers)
  private async runSandboxedScript(
    code: string,
    context: WorkflowContext
  ): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        URL.createObjectURL(
          new Blob([`
            const context = ${JSON.stringify(context)};

            // Restricted API
            const api = {
              log: (...args) => postMessage({ type: 'log', args }),
              setOutput: (key, value) => postMessage({ type: 'output', key, value }),
            };

            try {
              (function(context, api) {
                ${code}
              })(context, api);
              postMessage({ type: 'done' });
            } catch (e) {
              postMessage({ type: 'error', message: e.message });
            }
          `], { type: 'application/javascript' })
        )
      );

      const outputs: Record<string, any> = {};
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Script timeout'));
      }, 5000);

      worker.onmessage = (e) => {
        switch (e.data.type) {
          case 'output':
            outputs[e.data.key] = e.data.value;
            break;
          case 'done':
            clearTimeout(timeout);
            worker.terminate();
            resolve(outputs);
            break;
          case 'error':
            clearTimeout(timeout);
            worker.terminate();
            reject(new Error(e.data.message));
            break;
        }
      };
    });
  }

  // Placeholder implementations
  private setupTrigger(workflow: WorkflowDefinition): void { /* ... */ }
  private async evaluateConditions(conditions: WorkflowCondition[], context: WorkflowContext): Promise<boolean> { return true; }
  private async evaluateCondition(condition: any, context: WorkflowContext): Promise<boolean> { return true; }
  private async updateRecord(dbId: string, recordId: string, props: any): Promise<void> { /* ... */ }
  private async createRecord(dbId: string, props: any): Promise<{ id: string }> { return { id: '' }; }
  private async sendNotification(to: string, title: string, body: string): Promise<void> { /* ... */ }
  private async callWebhook(url: string, method: string, headers: any, body: any): Promise<any> { return {}; }
  private async storeExecution(execution: WorkflowExecution): Promise<void> { /* ... */ }
}

interface WorkflowContext {
  [key: string]: any;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt?: Date;
  context: WorkflowContext;
  steps: StepResult[];
  error?: string;
}

interface StepResult {
  action: string;
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  outputs: Record<string, any>;
  error?: string;
}

interface WorkflowResult {
  success: boolean;
  execution: WorkflowExecution;
}

interface WorkflowCondition {
  field: string;
  operator: string;
  value: any;
}
```

### 3.4 Dashboard Builder

```typescript
// packages/app/src/features/dashboards/builder/DashboardBuilder.tsx

import React from 'react';
import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { Dashboard, DashboardWidget } from '../types';
import { WidgetRenderer } from './WidgetRenderer';
import { WidgetPalette } from './WidgetPalette';
import { PropertyPanel } from './PropertyPanel';

interface DashboardBuilderProps {
  dashboard: Dashboard;
  onChange: (dashboard: Dashboard) => void;
  availableWidgets: WidgetDefinition[];
}

export function DashboardBuilder({
  dashboard,
  onChange,
  availableWidgets,
}: DashboardBuilderProps) {
  const [selectedWidget, setSelectedWidget] = React.useState<string | null>(null);
  const [draggedWidget, setDraggedWidget] = React.useState<DashboardWidget | null>(null);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Reorder widgets
      const oldIndex = dashboard.widgets.findIndex(w => w.id === active.id);
      const newIndex = dashboard.widgets.findIndex(w => w.id === over.id);

      const newWidgets = [...dashboard.widgets];
      const [removed] = newWidgets.splice(oldIndex, 1);
      newWidgets.splice(newIndex, 0, removed);

      onChange({ ...dashboard, widgets: newWidgets });
    }

    setDraggedWidget(null);
  };

  const handleAddWidget = (widgetType: string) => {
    const widgetDef = availableWidgets.find(w => w.type === widgetType);
    if (!widgetDef) return;

    const newWidget: DashboardWidget = {
      id: crypto.randomUUID(),
      type: widgetType,
      title: widgetDef.name,
      config: { ...widgetDef.defaultConfig },
      layout: {
        x: 0,
        y: Infinity, // Add to bottom
        w: widgetDef.defaultSize.w,
        h: widgetDef.defaultSize.h,
      },
    };

    onChange({
      ...dashboard,
      widgets: [...dashboard.widgets, newWidget],
    });

    setSelectedWidget(newWidget.id);
  };

  const handleUpdateWidget = (widgetId: string, updates: Partial<DashboardWidget>) => {
    onChange({
      ...dashboard,
      widgets: dashboard.widgets.map(w =>
        w.id === widgetId ? { ...w, ...updates } : w
      ),
    });
  };

  const handleDeleteWidget = (widgetId: string) => {
    onChange({
      ...dashboard,
      widgets: dashboard.widgets.filter(w => w.id !== widgetId),
    });
    setSelectedWidget(null);
  };

  return (
    <div className="dashboard-builder">
      <div className="dashboard-builder-sidebar">
        <WidgetPalette
          widgets={availableWidgets}
          onAdd={handleAddWidget}
        />
      </div>

      <div className="dashboard-builder-canvas">
        <DndContext onDragEnd={handleDragEnd}>
          <SortableContext
            items={dashboard.widgets.map(w => w.id)}
            strategy={rectSortingStrategy}
          >
            <div className="dashboard-grid">
              {dashboard.widgets.map(widget => (
                <WidgetRenderer
                  key={widget.id}
                  widget={widget}
                  isSelected={selectedWidget === widget.id}
                  isEditing={true}
                  onSelect={() => setSelectedWidget(widget.id)}
                  onUpdate={(updates) => handleUpdateWidget(widget.id, updates)}
                  onDelete={() => handleDeleteWidget(widget.id)}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {draggedWidget && (
              <WidgetRenderer
                widget={draggedWidget}
                isSelected={false}
                isEditing={false}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <div className="dashboard-builder-properties">
        {selectedWidget && (
          <PropertyPanel
            widget={dashboard.widgets.find(w => w.id === selectedWidget)!}
            widgetDef={availableWidgets.find(
              w => w.type === dashboard.widgets.find(dw => dw.id === selectedWidget)?.type
            )!}
            onChange={(updates) => handleUpdateWidget(selectedWidget, updates)}
          />
        )}
      </div>
    </div>
  );
}

// Widget definition for the palette
interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  category: 'charts' | 'lists' | 'metrics' | 'forms' | 'custom';
  defaultConfig: Record<string, any>;
  configSchema: JSONSchema;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize?: { w: number; h: number };
}

// Built-in widget definitions
export const BUILT_IN_WIDGETS: WidgetDefinition[] = [
  {
    type: 'metric',
    name: 'Metric',
    description: 'Display a single value with optional comparison',
    icon: 'hash',
    category: 'metrics',
    defaultConfig: {
      dataSource: null,
      aggregation: 'count',
      format: 'number',
      showComparison: false,
      comparisonPeriod: 'previous_period',
    },
    configSchema: { /* ... */ },
    defaultSize: { w: 2, h: 1 },
    minSize: { w: 1, h: 1 },
  },
  {
    type: 'bar-chart',
    name: 'Bar Chart',
    description: 'Visualize data with horizontal or vertical bars',
    icon: 'bar-chart',
    category: 'charts',
    defaultConfig: {
      dataSource: null,
      xAxis: null,
      yAxis: null,
      orientation: 'vertical',
      stacked: false,
    },
    configSchema: { /* ... */ },
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
  },
  {
    type: 'line-chart',
    name: 'Line Chart',
    description: 'Show trends over time',
    icon: 'trending-up',
    category: 'charts',
    defaultConfig: {
      dataSource: null,
      xAxis: null,
      yAxis: null,
      showArea: false,
      smoothLine: true,
    },
    configSchema: { /* ... */ },
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
  },
  {
    type: 'pie-chart',
    name: 'Pie Chart',
    description: 'Show proportions of a whole',
    icon: 'pie-chart',
    category: 'charts',
    defaultConfig: {
      dataSource: null,
      groupBy: null,
      valueField: null,
      showLabels: true,
      showLegend: true,
    },
    configSchema: { /* ... */ },
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
  },
  {
    type: 'data-table',
    name: 'Data Table',
    description: 'Display records in a table',
    icon: 'table',
    category: 'lists',
    defaultConfig: {
      dataSource: null,
      columns: [],
      pageSize: 10,
      sortable: true,
      filterable: true,
    },
    configSchema: { /* ... */ },
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 2 },
  },
  {
    type: 'kanban',
    name: 'Kanban Mini',
    description: 'Compact Kanban board view',
    icon: 'columns',
    category: 'lists',
    defaultConfig: {
      dataSource: null,
      groupBy: null,
      showCounts: true,
    },
    configSchema: { /* ... */ },
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
  },
];
```

### 3.5 Plugin System

```typescript
// packages/core/src/plugins/runtime.ts

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;

  // Entry points
  main: string;           // Main JS file
  styles?: string;        // Optional CSS

  // Capabilities requested
  permissions: PluginPermission[];

  // Extension points
  extends: {
    databases?: DatabaseExtension[];
    views?: ViewExtension[];
    actions?: ActionExtension[];
    widgets?: WidgetExtension[];
    commands?: CommandExtension[];
  };
}

type PluginPermission =
  | 'read:databases'
  | 'write:databases'
  | 'read:files'
  | 'write:files'
  | 'network'
  | 'notifications'
  | 'clipboard';

export class PluginRuntime {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private sandbox: PluginSandbox;

  constructor() {
    this.sandbox = new PluginSandbox();
  }

  async load(manifest: PluginManifest, code: string): Promise<void> {
    // Validate manifest
    this.validateManifest(manifest);

    // Check permissions with user
    const granted = await this.requestPermissions(manifest.permissions);
    if (!granted) {
      throw new Error('Plugin permissions denied');
    }

    // Create sandboxed context
    const context = this.sandbox.createContext(manifest.id, manifest.permissions);

    // Load plugin code in sandbox
    const exports = await this.sandbox.execute(code, context);

    // Register extensions
    const plugin: LoadedPlugin = {
      manifest,
      exports,
      context,
    };

    this.registerExtensions(plugin);
    this.plugins.set(manifest.id, plugin);
  }

  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    // Call plugin cleanup if defined
    if (plugin.exports.onUnload) {
      await plugin.exports.onUnload();
    }

    // Unregister extensions
    this.unregisterExtensions(plugin);

    // Destroy sandbox context
    this.sandbox.destroyContext(plugin.context);

    this.plugins.delete(pluginId);
  }

  private validateManifest(manifest: PluginManifest): void {
    // Validate required fields
    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new Error('Invalid plugin manifest: missing required fields');
    }

    // Validate semantic version
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new Error('Invalid plugin manifest: version must be semver');
    }

    // Validate permissions
    const validPermissions: PluginPermission[] = [
      'read:databases', 'write:databases', 'read:files',
      'write:files', 'network', 'notifications', 'clipboard'
    ];
    for (const perm of manifest.permissions) {
      if (!validPermissions.includes(perm)) {
        throw new Error(`Invalid plugin permission: ${perm}`);
      }
    }
  }

  private async requestPermissions(permissions: PluginPermission[]): Promise<boolean> {
    // Show permission dialog to user
    // Return true if user grants all permissions
    return true; // Simplified
  }

  private registerExtensions(plugin: LoadedPlugin): void {
    const { extends: ext } = plugin.manifest;

    if (ext?.widgets) {
      for (const widget of ext.widgets) {
        // Register widget component
        widgetRegistry.register(widget.id, {
          ...widget,
          component: plugin.exports[widget.component],
        });
      }
    }

    if (ext?.commands) {
      for (const command of ext.commands) {
        // Register command handler
        commandRegistry.register(command.id, {
          ...command,
          handler: plugin.exports[command.handler],
        });
      }
    }

    // ... register other extension types
  }

  private unregisterExtensions(plugin: LoadedPlugin): void {
    const { extends: ext } = plugin.manifest;

    if (ext?.widgets) {
      for (const widget of ext.widgets) {
        widgetRegistry.unregister(widget.id);
      }
    }

    if (ext?.commands) {
      for (const command of ext.commands) {
        commandRegistry.unregister(command.id);
      }
    }
  }
}

// Sandboxed execution using iframe + postMessage
class PluginSandbox {
  private iframes: Map<string, HTMLIFrameElement> = new Map();

  createContext(pluginId: string, permissions: PluginPermission[]): PluginContext {
    // Create sandboxed iframe
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    this.iframes.set(pluginId, iframe);

    return {
      pluginId,
      permissions,
      iframe,
    };
  }

  async execute(code: string, context: PluginContext): Promise<any> {
    const { iframe, permissions } = context;

    // Inject API based on permissions
    const api = this.buildAPI(permissions);

    // Send code to iframe for execution
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;

        if (event.data.type === 'ready') {
          iframe.contentWindow!.postMessage({
            type: 'execute',
            code,
            api: Object.keys(api),
          }, '*');
        } else if (event.data.type === 'api-call') {
          // Handle API calls from plugin
          const { method, args, callId } = event.data;
          if (api[method]) {
            Promise.resolve(api[method](...args))
              .then(result => {
                iframe.contentWindow!.postMessage({
                  type: 'api-result',
                  callId,
                  result,
                }, '*');
              })
              .catch(error => {
                iframe.contentWindow!.postMessage({
                  type: 'api-error',
                  callId,
                  error: error.message,
                }, '*');
              });
          }
        } else if (event.data.type === 'exports') {
          window.removeEventListener('message', handler);
          resolve(event.data.exports);
        } else if (event.data.type === 'error') {
          window.removeEventListener('message', handler);
          reject(new Error(event.data.error));
        }
      };

      window.addEventListener('message', handler);

      // Initialize iframe with sandbox runtime
      iframe.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
          <script>
            // Sandbox runtime
            const api = {};
            const pendingCalls = new Map();
            let callId = 0;

            window.addEventListener('message', async (event) => {
              if (event.data.type === 'execute') {
                try {
                  // Create API proxy
                  for (const method of event.data.api) {
                    api[method] = (...args) => {
                      return new Promise((resolve, reject) => {
                        const id = callId++;
                        pendingCalls.set(id, { resolve, reject });
                        parent.postMessage({
                          type: 'api-call',
                          method,
                          args,
                          callId: id,
                        }, '*');
                      });
                    };
                  }

                  // Execute plugin code
                  const exports = {};
                  const module = { exports };
                  (new Function('module', 'exports', 'api', event.data.code))(module, exports, api);

                  parent.postMessage({ type: 'exports', exports: module.exports }, '*');
                } catch (e) {
                  parent.postMessage({ type: 'error', error: e.message }, '*');
                }
              } else if (event.data.type === 'api-result') {
                const pending = pendingCalls.get(event.data.callId);
                if (pending) {
                  pending.resolve(event.data.result);
                  pendingCalls.delete(event.data.callId);
                }
              } else if (event.data.type === 'api-error') {
                const pending = pendingCalls.get(event.data.callId);
                if (pending) {
                  pending.reject(new Error(event.data.error));
                  pendingCalls.delete(event.data.callId);
                }
              }
            });

            parent.postMessage({ type: 'ready' }, '*');
          </script>
        </head>
        <body></body>
        </html>
      `;
    });
  }

  private buildAPI(permissions: PluginPermission[]): Record<string, Function> {
    const api: Record<string, Function> = {};

    if (permissions.includes('read:databases')) {
      api.queryDatabase = async (dbId: string, query: any) => {
        // Implement database query
      };
    }

    if (permissions.includes('write:databases')) {
      api.createRecord = async (dbId: string, data: any) => {
        // Implement record creation
      };
      api.updateRecord = async (dbId: string, recordId: string, data: any) => {
        // Implement record update
      };
    }

    if (permissions.includes('notifications')) {
      api.showNotification = async (title: string, body: string) => {
        // Implement notification
      };
    }

    // ... other permission-based APIs

    return api;
  }

  destroyContext(context: PluginContext): void {
    const iframe = this.iframes.get(context.pluginId);
    if (iframe) {
      iframe.remove();
      this.iframes.delete(context.pluginId);
    }
  }
}

interface LoadedPlugin {
  manifest: PluginManifest;
  exports: any;
  context: PluginContext;
}

interface PluginContext {
  pluginId: string;
  permissions: PluginPermission[];
  iframe: HTMLIFrameElement;
}

interface DatabaseExtension {
  id: string;
  name: string;
  properties: PropertyDefinition[];
}

interface ViewExtension {
  id: string;
  name: string;
  component: string;
}

interface ActionExtension {
  id: string;
  name: string;
  icon: string;
  handler: string;
}

interface WidgetExtension {
  id: string;
  name: string;
  component: string;
  configSchema: any;
}

interface CommandExtension {
  id: string;
  name: string;
  shortcut?: string;
  handler: string;
}

// Registries (simplified)
const widgetRegistry = {
  register: (id: string, widget: any) => {},
  unregister: (id: string) => {},
};

const commandRegistry = {
  register: (id: string, command: any) => {},
  unregister: (id: string) => {},
};
```

### 3.6 Phase 3 Feature Priorities

| Quarter | Focus | Key Features |
|---------|-------|--------------|
| Q1 | Module Framework | Module system, CRM core, basic workflows |
| Q2 | HRM + Inventory | Employee management, product catalog, orders |
| Q3 | Finance + Analytics | Invoicing, expenses, dashboard builder |
| Q4 | Integrations + Plugins | API gateway, OAuth, plugin marketplace |
| Q5+ | Vertical Solutions | Industry-specific modules, enterprise features |

---

## Engineering Best Practices

### Security Guidelines

1. **Data Security**
   - All data encrypted at rest (IndexedDB) and in transit (TLS 1.3)
   - Key derivation using Argon2id for passwords
   - Regular key rotation for workspace keys
   - Secure key storage (browser Credential Management API)

2. **Authentication & Authorization**
   - Self-sovereign identity (DIDs with did:key method)
   - UCAN (User Controlled Authorization Networks) for capability-based permissions
   - Multi-factor authentication support
   - Session management with secure token storage

3. **Code Security**
   - No `eval()` or `Function()` in main codebase
   - Sandboxed plugin execution
   - CSP headers for web deployment
   - Dependency auditing with Snyk/Dependabot

4. **Security Audits**
   - Phase 1: Focus on cryptographic implementation
   - Phase 2: P2P protocol review, data integrity
   - Phase 3: Plugin sandbox, workflow engine

### Scalability Strategies

1. **Client-Side Performance**
   - Virtual scrolling for large datasets
   - Web Workers for heavy computation
   - IndexedDB sharding by workspace
   - Lazy loading of modules

2. **P2P Network Scalability**
   - Hierarchical gossip (super-peers for large workspaces)
   - Selective sync (only sync what's needed)
   - Delta compression for sync messages
   - Bloom filters for efficient reconciliation

3. **Data Model Scalability**
   - Pagination for large collections
   - Computed views with caching
   - Background indexing for search
   - Incremental CRDT updates

### Open Source Contribution Guidelines

```markdown
# Contributing to xNotes

## Code of Conduct
We follow the Contributor Covenant. Be respectful and inclusive.

## Development Setup
1. Fork and clone the repo
2. Install dependencies: `pnpm install`
3. Start dev server: `pnpm dev`
4. Run tests: `pnpm test`

## Pull Request Process
1. Create a feature branch from `develop`
2. Write tests for new functionality
3. Ensure all tests pass and linting is clean
4. Update documentation if needed
5. Submit PR with clear description

## Commit Messages
Follow Conventional Commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance

## Code Style
- TypeScript strict mode
- ESLint + Prettier
- Functional components with hooks
- Comprehensive JSDoc comments

## Review Process
- Two approvals required for merge
- CI must pass
- No unresolved conversations
```

---

## Monetization & Adoption Strategy

### Revenue Model

| Tier | Price | Features |
|------|-------|----------|
| **Free (Core)** | $0 | Full app, local storage, P2P sync (3 users) |
| **Team** | $8/user/mo | Unlimited workspace members, priority signaling servers |
| **Enterprise** | Custom | SLA, dedicated support, on-premise option, custom modules |

### Token Economics (Future)

```
$XNOTES Token Utility:
├── Storage Incentives
│   ├── Earn: Provide storage/relay capacity
│   └── Spend: Access DePIN storage network
│
├── Premium Features
│   ├── Advanced AI features
│   ├── Extended history/versioning
│   └── Custom domain workspaces
│
├── Governance
│   ├── Vote on feature roadmap
│   ├── Module marketplace curation
│   └── Protocol upgrades
│
└── Marketplace
    ├── Buy/sell plugins
    ├── Templates
    └── Professional services
```

### Adoption Funnel

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWARENESS                                │
│  • Developer content (blog, YouTube, podcasts)                  │
│  • Open source community engagement                             │
│  • Privacy-focused publications                                 │
│  • Comparison content (vs Notion/Asana/Monday)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       ACQUISITION                               │
│  • Free tier with full functionality                            │
│  • One-click templates (personal wiki, team tasks)              │
│  • Import from Notion/Roam/Obsidian                             │
│  • Browser extension for quick capture                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       ACTIVATION                                │
│  • Interactive onboarding tour                                  │
│  • Pre-populated sample workspace                               │
│  • Quick wins (create first page in <2 min)                     │
│  • Keyboard shortcut tutorial                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        RETENTION                                │
│  • Daily digest / notifications                                 │
│  • Graph view gamification                                      │
│  • Weekly "workspace insights"                                  │
│  • Community templates & showcases                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        REFERRAL                                 │
│  • Easy workspace sharing                                       │
│  • Referral rewards (extended storage)                          │
│  • Team conversion incentives                                   │
│  • Public workspace showcase                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        REVENUE                                  │
│  • Team tier upsell at 4+ members                               │
│  • Enterprise for compliance needs                              │
│  • Marketplace revenue share                                    │
│  • Token ecosystem                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Community Building

1. **Discord Server**: Developer community, support, feature discussions
2. **GitHub Discussions**: Technical RFCs, roadmap input
3. **Weekly Office Hours**: Video calls with core team
4. **Contributor Program**: Swag, recognition, bounties
5. **Module Showcase**: Highlight community-built modules
6. **Annual Conference**: xNet Summit (virtual/hybrid)

---

## Appendix

### A. Sample Code Snippets

#### Basic CRDT Block Implementation

```typescript
// Simplified CRDT block for illustration
import * as Y from 'yjs';

export class CRDTBlock<T extends Record<string, any>> {
  private ymap: Y.Map<any>;

  constructor(ydoc: Y.Doc, blockId: string, initialData?: T) {
    this.ymap = ydoc.getMap(`block:${blockId}`);

    if (initialData) {
      ydoc.transact(() => {
        for (const [key, value] of Object.entries(initialData)) {
          this.ymap.set(key, value);
        }
      });
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.ymap.get(key as string);
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.ymap.set(key as string, value);
  }

  update(updates: Partial<T>): void {
    this.ymap.doc?.transact(() => {
      for (const [key, value] of Object.entries(updates)) {
        this.ymap.set(key, value);
      }
    });
  }

  toJSON(): T {
    return this.ymap.toJSON() as T;
  }

  observe(callback: (changes: Map<string, any>) => void): () => void {
    const handler = (event: Y.YMapEvent<any>) => {
      callback(event.changes.keys);
    };
    this.ymap.observe(handler);
    return () => this.ymap.unobserve(handler);
  }
}

// Usage
interface PageData {
  '@id': string;
  '@type': 'Page';
  title: string;
  content: any;
  updatedAt: string;
}

const ydoc = new Y.Doc();
const page = new CRDTBlock<PageData>(ydoc, 'page-123', {
  '@id': 'page-123',
  '@type': 'Page',
  title: 'My First Page',
  content: { type: 'doc', content: [] },
  updatedAt: new Date().toISOString(),
});

// Observe changes
page.observe((changes) => {
  console.log('Page changed:', changes);
});

// Update page
page.set('title', 'Updated Title');
```

#### P2P Connection Manager

```typescript
// Simplified connection manager
export class ConnectionManager {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();

  async connect(peerId: string, signalingChannel: SignalingChannel): Promise<void> {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });

    this.connections.set(peerId, pc);

    // Create data channel
    const dc = pc.createDataChannel('xnotes', {
      ordered: true,
    });

    dc.onopen = () => {
      console.log(`Connected to ${peerId}`);
      this.dataChannels.set(peerId, dc);
    };

    dc.onmessage = (event) => {
      this.handleMessage(peerId, event.data);
    };

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingChannel.send(peerId, {
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      }
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    signalingChannel.send(peerId, {
      type: 'offer',
      sdp: offer.sdp,
    });

    // Handle answer
    signalingChannel.onMessage(peerId, async (message) => {
      if (message.type === 'answer') {
        await pc.setRemoteDescription({
          type: 'answer',
          sdp: message.sdp,
        });
      } else if (message.type === 'ice-candidate') {
        await pc.addIceCandidate(message.candidate);
      }
    });
  }

  send(peerId: string, data: any): void {
    const dc = this.dataChannels.get(peerId);
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify(data));
    }
  }

  broadcast(data: any): void {
    const message = JSON.stringify(data);
    for (const dc of this.dataChannels.values()) {
      if (dc.readyState === 'open') {
        dc.send(message);
      }
    }
  }

  private handleMessage(peerId: string, data: string): void {
    const message = JSON.parse(data);
    // Emit event or call handlers
    console.log(`Message from ${peerId}:`, message);
  }
}

interface SignalingChannel {
  send(peerId: string, message: any): void;
  onMessage(peerId: string, handler: (message: any) => void): void;
}
```

### B. Architecture Diagrams

#### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERACTION                               │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         REACT COMPONENTS                             │   │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│  │   │  Editor  │  │  Tasks   │  │ Database │  │ Dashboard│           │   │
│  │   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │   │
│  └────────┼─────────────┼─────────────┼─────────────┼───────────────────┘   │
│           │             │             │             │                       │
│           └─────────────┴──────┬──────┴─────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          ZUSTAND STORES                              │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│  │   │ WorkspaceStore│  │  PageStore   │  │  TaskStore   │             │   │
│  │   └───────┬──────┘  └───────┬──────┘  └───────┬──────┘             │   │
│  └───────────┼─────────────────┼─────────────────┼───────────────────────┘   │
│              │                 │                 │                          │
│              └─────────────────┴────────┬────────┘                          │
│                                         │                                   │
│                                         ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         YJS DOCUMENT (CRDT)                          │   │
│  │   ┌──────────────────────────────────────────────────────────────┐  │   │
│  │   │  Y.Doc                                                        │  │   │
│  │   │  ├── Y.Map('blocks')     ◄──── All block data                 │  │   │
│  │   │  ├── Y.Map('pages')      ◄──── Page metadata                  │  │   │
│  │   │  ├── Y.Map('tasks')      ◄──── Task metadata                  │  │   │
│  │   │  └── Y.XmlFragment(*)    ◄──── Rich text per page             │  │   │
│  │   └──────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────┬──────────────────────────────────┘   │
│                                     │                                      │
│              ┌──────────────────────┴──────────────────────┐               │
│              │                                              │               │
│              ▼                                              ▼               │
│  ┌───────────────────────┐                    ┌───────────────────────┐    │
│  │    y-indexeddb        │                    │      y-webrtc         │    │
│  │  (Local Persistence)  │                    │    (P2P Sync)         │    │
│  └───────────┬───────────┘                    └───────────┬───────────┘    │
│              │                                            │                │
│              ▼                                            ▼                │
│  ┌───────────────────────┐                    ┌───────────────────────┐    │
│  │      IndexedDB        │                    │     WebRTC Peers      │    │
│  │   (Browser Storage)   │                    │   (Other Devices)     │    │
│  └───────────────────────┘                    └───────────────────────┘    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Module System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MODULE REGISTRY                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Core Modules                                 │   │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │   │  Wiki   │  │  Tasks  │  │Database │  │Dashboard│  │ Search  │  │   │
│  │   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │   │
│  └────────┼────────────┼────────────┼────────────┼────────────┼────────┘   │
│           │            │            │            │            │            │
│           └────────────┴────────────┴─────┬──────┴────────────┘            │
│                                           │                                │
│                                           ▼                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        MODULE LOADER                                 │   │
│  │  • Resolves dependencies                                             │   │
│  │  • Validates manifests                                               │   │
│  │  • Manages lifecycle hooks                                           │   │
│  │  • Handles permissions                                               │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                          │
│                                 ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      EXTENSION POINTS                                │   │
│  │                                                                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   Schema     │  │  Components  │  │   Workflows  │               │   │
│  │  │  Extensions  │  │  Extensions  │  │  Extensions  │               │   │
│  │  │              │  │              │  │              │               │   │
│  │  │ • Properties │  │ • Pages      │  │ • Triggers   │               │   │
│  │  │ • Databases  │  │ • Widgets    │  │ • Actions    │               │   │
│  │  │ • Relations  │  │ • Actions    │  │ • Conditions │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │     API      │  │  Commands    │  │   Settings   │               │   │
│  │  │  Extensions  │  │  Extensions  │  │  Extensions  │               │   │
│  │  │              │  │              │  │              │               │   │
│  │  │ • Endpoints  │  │ • Shortcuts  │  │ • Module     │               │   │
│  │  │ • Webhooks   │  │ • Palette    │  │   config     │               │   │
│  │  │ • Middleware │  │ • Context    │  │ • User prefs │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│                    ┌───────────────────────────────┐                       │
│                    │       BUSINESS MODULES        │                       │
│                    │                               │                       │
│                    │  ┌─────┐ ┌─────┐ ┌─────┐    │                       │
│                    │  │ CRM │ │ HRM │ │ INV │ ...│                       │
│                    │  └─────┘ └─────┘ └─────┘    │                       │
│                    │                               │                       │
│                    │       THIRD-PARTY PLUGINS     │                       │
│                    │                               │                       │
│                    │  ┌─────┐ ┌─────┐ ┌─────┐    │                       │
│                    │  │ AI  │ │Chart│ │ Git │ ...│                       │
│                    │  └─────┘ └─────┘ └─────┘    │                       │
│                    └───────────────────────────────┘                       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### C. Wireframe Pseudocode

#### Main App Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Logo] xNotes                    [Search...]              [User] [Settings] │
├───────────────┬─────────────────────────────────────────────────────────────┤
│               │                                                             │
│  SIDEBAR      │  MAIN CONTENT AREA                                          │
│               │                                                             │
│  ┌─────────┐  │  ┌─────────────────────────────────────────────────────┐   │
│  │ ★ Home  │  │  │  Page Title                              [⋮] [Share]│   │
│  ├─────────┤  │  ├─────────────────────────────────────────────────────┤   │
│  │ Pages   │  │  │                                                     │   │
│  │  ├ Page1│  │  │  Rich text content area                             │   │
│  │  ├ Page2│  │  │                                                     │   │
│  │  └ Page3│  │  │  • Bullet points                                    │   │
│  ├─────────┤  │  │  • [[Linked Pages]]                                 │   │
│  │ Tasks   │  │  │  • /slash commands                                  │   │
│  │  ├Board │  │  │                                                     │   │
│  │  └List  │  │  │  ┌─────────────────────────────────────────────┐   │   │
│  ├─────────┤  │  │  │ Embedded Database                           │   │   │
│  │ Database│  │  │  │ ┌────┬─────┬────────┬────────┐             │   │   │
│  │  ├ DB1  │  │  │  │ │Name│Status│  Date  │Assignee│             │   │   │
│  │  └ DB2  │  │  │  │ ├────┼─────┼────────┼────────┤             │   │   │
│  ├─────────┤  │  │  │ │Row1│ ✓   │Jan 15  │ @user  │             │   │   │
│  │ Modules │  │  │  │ │Row2│ ○   │Jan 20  │ @user2 │             │   │   │
│  │  ├ CRM  │  │  │  │ └────┴─────┴────────┴────────┘             │   │   │
│  │  └ HRM  │  │  │  └─────────────────────────────────────────────┘   │   │
│  ├─────────┤  │  │                                                     │   │
│  │[+ New]  │  │  │  More content below...                              │   │
│  └─────────┘  │  │                                                     │   │
│               │  └─────────────────────────────────────────────────────┘   │
│  BACKLINKS    │                                                             │
│  ┌─────────┐  │  ┌─────────────────────────────────────────────────────┐   │
│  │ Page4   │  │  │  BACKLINKS (3)                              [Hide]  │   │
│  │ Page5   │  │  │  • Page4: "...references this [[page]]..."         │   │
│  │ Page6   │  │  │  • Page5: "Related to [[this]]..."                 │   │
│  └─────────┘  │  │  • Page6: "See also [[current page]]..."           │   │
│               │  └─────────────────────────────────────────────────────┘   │
│               │                                                             │
└───────────────┴─────────────────────────────────────────────────────────────┘
```

#### Kanban Board View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Project Tasks                    [Filter ▼] [Sort ▼] [+ New View] [⋮]     │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Table] [Board ●] [Calendar] [Timeline] [Gallery]                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────────┐ │
│  │ TO DO (5)      │ │ IN PROGRESS (3)│ │ IN REVIEW (2)  │ │ DONE (12)    │ │
│  │                │ │                │ │                │ │              │ │
│  │ ┌────────────┐ │ │ ┌────────────┐ │ │ ┌────────────┐ │ │ ┌──────────┐ │ │
│  │ │ Task 1     │ │ │ │ Task 6     │ │ │ │ Task 9     │ │ │ │ Task 11  │ │ │
│  │ │ @user      │ │ │ │ @user2     │ │ │ │ @user      │ │ │ │ ✓ Done   │ │ │
│  │ │ Due: Jan 15│ │ │ │ Due: Jan 12│ │ │ │ Due: Jan 14│ │ │ └──────────┘ │ │
│  │ │ [!] High   │ │ │ │ [!] Medium │ │ │ │ [!] High   │ │ │              │ │
│  │ └────────────┘ │ │ └────────────┘ │ │ └────────────┘ │ │ ┌──────────┐ │ │
│  │                │ │                │ │                │ │ │ Task 12  │ │ │
│  │ ┌────────────┐ │ │ ┌────────────┐ │ │ ┌────────────┐ │ │ │ ✓ Done   │ │ │
│  │ │ Task 2     │ │ │ │ Task 7     │ │ │ │ Task 10    │ │ │ └──────────┘ │ │
│  │ │ @user3     │ │ │ │ @user      │ │ │ │ @user2     │ │ │              │ │
│  │ │ Due: Jan 18│ │ │ │ Due: Jan 16│ │ │ │ Due: Jan 15│ │ │     ...      │ │
│  │ └────────────┘ │ │ └────────────┘ │ │ └────────────┘ │ │              │ │
│  │                │ │                │ │                │ │              │ │
│  │ ┌────────────┐ │ │ ┌────────────┐ │ │                │ │              │ │
│  │ │ Task 3     │ │ │ │ Task 8     │ │ │                │ │              │ │
│  │ │ Unassigned │ │ │ │ @user3     │ │ │                │ │              │ │
│  │ └────────────┘ │ │ └────────────┘ │ │                │ │              │ │
│  │                │ │                │ │                │ │              │ │
│  │ [+ Add Task]   │ │ [+ Add Task]   │ │ [+ Add Task]   │ │ [+ Add Task] │ │
│  └────────────────┘ └────────────────┘ └────────────────┘ └──────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### D. Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.3.0 | UI framework |
| typescript | ^5.4.0 | Type safety |
| yjs | ^13.6.0 | CRDT implementation |
| @tiptap/core | ^2.4.0 | Rich text editor |
| libp2p | ^1.3.0 | P2P networking |
| @tanstack/react-table | ^8.15.0 | Table/grid component |
| @tanstack/react-virtual | ^3.2.0 | Virtual scrolling |
| @dnd-kit/core | ^6.1.0 | Drag and drop |
| zustand | ^4.5.0 | State management |
| zod | ^3.22.0 | Schema validation |
| lunr | ^2.3.9 | Full-text search |
| libsodium-wrappers | ^0.7.13 | Cryptography |
| date-fns | ^3.3.0 | Date utilities |
| tailwindcss | ^3.4.0 | Styling |
| vite | ^5.2.0 | Build tool |
| vitest | ^1.4.0 | Testing |
| playwright | ^1.42.0 | E2E testing |

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building xNotes as the flagship application of the xNet decentralized ecosystem. The phased approach allows for:

1. **Phase 1**: Establishing product-market fit with a compelling wiki + task manager
2. **Phase 2**: Expanding to a full database UI platform competitive with Notion
3. **Phase 3**: Evolving into an open-source ERP system with enterprise capabilities

Key success factors:

- **User Experience First**: Despite technical complexity, prioritize intuitive UX
- **Progressive Decentralization**: Start with simpler sync, evolve to full P2P
- **Community Building**: Open source from day one, cultivate contributors
- **Security by Design**: E2E encryption and self-sovereign identity throughout
- **Sustainable Economics**: Token model aligns incentives across ecosystem

The technical architecture balances ambitious decentralization goals with practical implementation realities, using proven technologies (React, Yjs, libp2p) while leaving room for innovation in AI integration and vertical solutions.

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Authors: xNet Architecture Team*
