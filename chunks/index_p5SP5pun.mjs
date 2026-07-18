import { g as createVNode, F as Fragment, _ as __astro_tag_component__ } from './astro/server_CDqOe6mW.mjs';
import { $ as $$CardGrid, a as $$LinkCard } from './Code_DejOdlcC.mjs';

const frontmatter = {
  "title": "xNet Documentation",
  "draft": false,
  "description": "Build local-first apps with React hooks. No server, no auth, no vendor lock-in."
};
function getHeadings() {
  return [{
    "depth": 2,
    "slug": "get-started",
    "text": "Get started"
  }, {
    "depth": 2,
    "slug": "react-hooks",
    "text": "React Hooks"
  }, {
    "depth": 2,
    "slug": "schemas--data",
    "text": "Schemas & Data"
  }, {
    "depth": 2,
    "slug": "guides",
    "text": "Guides"
  }, {
    "depth": 2,
    "slug": "concepts",
    "text": "Concepts"
  }, {
    "depth": 2,
    "slug": "packages",
    "text": "Packages"
  }];
}
function _createMdxContent(props) {
  const {Fragment: Fragment$1} = props.components || ({});
  if (!Fragment$1) _missingMdxReference("Fragment");
  return createVNode(Fragment, {
    children: [createVNode(Fragment$1, {
      "set:html": "<p>xNet is a local-first React framework. Your data lives on the device, syncs peer-to-peer, and works offline. Three hooks replace your entire backend.</p>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"get-started\">Get started</h2><a class=\"sl-anchor-link\" href=\"#get-started\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Get started”</span></a></div>\n"
    }), createVNode($$CardGrid, {
      children: [createVNode($$LinkCard, {
        title: "Introduction",
        description: "What xNet is and when to use it.",
        href: "/docs/introduction/"
      }), createVNode($$LinkCard, {
        title: "Quick Start",
        description: "Build a task manager in 5 minutes.",
        href: "/docs/quickstart/"
      }), createVNode($$LinkCard, {
        title: "Core Concepts",
        description: "Schemas, hooks, sync — the mental model.",
        href: "/docs/core-concepts/"
      }), createVNode($$LinkCard, {
        title: "The Protocol",
        description: "xNet is an open, re-implementable standard — not just this app.",
        href: "/docs/protocol/overview/"
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"react-hooks\">React Hooks</h2><a class=\"sl-anchor-link\" href=\"#react-hooks\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “React Hooks”</span></a></div>\n"
    }), createVNode($$CardGrid, {
      children: [createVNode($$LinkCard, {
        title: "useQuery",
        description: "Read data reactively with filtering, sorting, and pagination.",
        href: "/docs/hooks/usequery/"
      }), createVNode($$LinkCard, {
        title: "useMutate",
        description: "Create, update, delete nodes with full type safety.",
        href: "/docs/hooks/usemutate/"
      }), createVNode($$LinkCard, {
        title: "useNode",
        description: "Collaborative editing with Yjs, P2P sync, and presence.",
        href: "/docs/hooks/usenode/"
      }), createVNode($$LinkCard, {
        title: "useIdentity",
        description: "Access the current user's DID and auth status.",
        href: "/docs/hooks/useidentity/"
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"schemas--data\">Schemas &#x26; Data</h2><a class=\"sl-anchor-link\" href=\"#schemas--data\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Schemas &#x26; Data”</span></a></div>\n"
    }), createVNode($$CardGrid, {
      children: [createVNode($$LinkCard, {
        title: "defineSchema",
        description: "Define typed schemas with 15 property types.",
        href: "/docs/schemas/defineschema/"
      }), createVNode($$LinkCard, {
        title: "Property Types",
        description: "text, number, date, select, relation, person, and more.",
        href: "/docs/schemas/property-types/"
      }), createVNode($$LinkCard, {
        title: "Relations",
        description: "Link nodes together with relation() and person().",
        href: "/docs/schemas/relations/"
      }), createVNode($$LinkCard, {
        title: "Type Inference",
        description: "How TypeScript types flow from schemas to hooks.",
        href: "/docs/schemas/type-inference/"
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"guides\">Guides</h2><a class=\"sl-anchor-link\" href=\"#guides\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Guides”</span></a></div>\n"
    }), createVNode($$CardGrid, {
      children: [createVNode($$LinkCard, {
        title: "Authorization",
        description: "Encryption-first access control: schema roles, grants, delegation, and key recovery.",
        href: "/docs/guides/authorization/"
      }), createVNode($$LinkCard, {
        title: "Plugin Development",
        description: "Build extensions with the 4-layer plugin system.",
        href: "/docs/guides/plugins/"
      }), createVNode($$LinkCard, {
        title: "Sync",
        description: "How P2P sync works and how to configure it.",
        href: "/docs/guides/sync/"
      }), createVNode($$LinkCard, {
        title: "Identity & Keys",
        description: "DID:key pairs, UCAN tokens, and key management.",
        href: "/docs/guides/identity/"
      }), createVNode($$LinkCard, {
        title: "Real-time Collaboration",
        description: "Collaborative editors with useNode and TipTap.",
        href: "/docs/guides/collaboration/"
      }), createVNode($$LinkCard, {
        title: "Offline Patterns",
        description: "Building apps that work without connectivity.",
        href: "/docs/guides/offline/"
      }), createVNode($$LinkCard, {
        title: "Infinite Canvas",
        description: "Spatial canvas with R-tree indexing and layout algorithms.",
        href: "/docs/guides/canvas/"
      }), createVNode($$LinkCard, {
        title: "Rich Text Editor",
        description: "TipTap editor with Yjs collaboration and slash commands.",
        href: "/docs/guides/editor/"
      }), createVNode($$LinkCard, {
        title: "Hub & Signaling",
        description: "Signaling server, self-hosting, and Hub roadmap.",
        href: "/docs/guides/hub/"
      }), createVNode($$LinkCard, {
        title: "Connect to xNet Cloud",
        description: "Link your web, desktop, or mobile app to a managed hub.",
        href: "/docs/guides/cloud-connect/"
      }), createVNode($$LinkCard, {
        title: "DevTools",
        description: "9 debug panels, event bus, and instrumentation.",
        href: "/docs/guides/devtools/"
      }), createVNode($$LinkCard, {
        title: "Electron Setup",
        description: "Running xNet in an Electron desktop app.",
        href: "/docs/guides/electron/"
      }), createVNode($$LinkCard, {
        title: "Testing",
        description: "Testing xNet apps with Vitest.",
        href: "/docs/guides/testing/"
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"concepts\">Concepts</h2><a class=\"sl-anchor-link\" href=\"#concepts\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Concepts”</span></a></div>\n"
    }), createVNode($$CardGrid, {
      children: [createVNode($$LinkCard, {
        title: "Local-First",
        description: "Why local-first matters and how xNet implements it.",
        href: "/docs/concepts/local-first/"
      }), createVNode($$LinkCard, {
        title: "CRDTs",
        description: "Conflict-free replicated data types explained.",
        href: "/docs/concepts/crdts/"
      }), createVNode($$LinkCard, {
        title: "Network & Transport",
        description: "libp2p, WebRTC, security layers, and peer scoring.",
        href: "/docs/concepts/network/"
      }), createVNode($$LinkCard, {
        title: "Sync Architecture",
        description: "Dual-CRDT model, Lamport clocks, and merge strategies.",
        href: "/docs/concepts/sync-architecture/"
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"packages\">Packages</h2><a class=\"sl-anchor-link\" href=\"#packages\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Packages”</span></a></div>\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n<table><thead><tr><th>Package</th><th>Description</th></tr></thead><tbody><tr><td><code dir=\"auto\">@xnetjs/react</code></td><td>React hooks: useQuery, useMutate, useNode, useIdentity</td></tr><tr><td><code dir=\"auto\">@xnetjs/data</code></td><td>Schema system, NodeStore, 15 property types</td></tr><tr><td><code dir=\"auto\">@xnetjs/sync</code></td><td>Lamport clocks, Change&#x3C;T>, Yjs security</td></tr><tr><td><code dir=\"auto\">@xnetjs/crypto</code></td><td>BLAKE3, Ed25519, XChaCha20-Poly1305</td></tr><tr><td><code dir=\"auto\">@xnetjs/identity</code></td><td>DID:key, UCAN tokens, key management</td></tr><tr><td><code dir=\"auto\">@xnetjs/plugins</code></td><td>4-layer plugin system (scripts, extensions, services, integrations)</td></tr><tr><td><code dir=\"auto\">@xnetjs/storage</code></td><td>SQLite adapter</td></tr><tr><td><code dir=\"auto\">@xnetjs/editor</code></td><td>TipTap rich text editor with Yjs collaboration</td></tr><tr><td><code dir=\"auto\">@xnetjs/canvas</code></td><td>Infinite canvas with spatial indexing</td></tr><tr><td><code dir=\"auto\">@xnetjs/network</code></td><td>libp2p, WebRTC/WebSocket transport</td></tr></tbody></table>"
    })]
  });
}
function MDXContent(props = {}) {
  const {wrapper: MDXLayout} = props.components || ({});
  return MDXLayout ? createVNode(MDXLayout, {
    ...props,
    children: createVNode(_createMdxContent, {
      ...props
    })
  }) : _createMdxContent(props);
}
function _missingMdxReference(id, component) {
  throw new Error("Expected " + ("component" ) + " `" + id + "` to be defined: you likely forgot to import, pass, or provide it.");
}

const url = "src/content/docs/docs/index.mdx";
const file = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/index.mdx";
const Content = (props = {}) => MDXContent({
  ...props,
  components: { Fragment: Fragment, ...props.components, },
});
Content[Symbol.for('mdx-component')] = true;
Content[Symbol.for('astro.needsHeadRendering')] = !Boolean(frontmatter.layout);
Content.moduleId = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/index.mdx";
__astro_tag_component__(Content, 'astro:jsx');

export { Content, Content as default, file, frontmatter, getHeadings, url };
