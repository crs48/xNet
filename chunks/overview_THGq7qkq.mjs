import { g as createVNode, F as Fragment, _ as __astro_tag_component__ } from './astro/server_CDqOe6mW.mjs';
import { g as $$Aside, $ as $$CardGrid, a as $$LinkCard } from './Code_DejOdlcC.mjs';

const frontmatter = {
  "title": "The XNet Protocol",
  "draft": false,
  "description": "XNet is an open protocol, not just an app. Anyone can re-implement it in any language, over any database, and interoperate.",
  "sidebar": {
    "order": 1,
    "label": "Overview"
  }
};
function getHeadings() {
  return [{
    "depth": 2,
    "slug": "the-boundary-in-one-sentence",
    "text": "The boundary in one sentence"
  }, {
    "depth": 2,
    "slug": "four-normative-layers",
    "text": "Four normative layers"
  }, {
    "depth": 2,
    "slug": "the-interop-kernel-the-part-that-makes-it-xnet",
    "text": "The interop kernel (the part that makes it XNet)"
  }, {
    "depth": 2,
    "slug": "yjs-is-not-the-protocol",
    "text": "Yjs is not the protocol"
  }, {
    "depth": 2,
    "slug": "one-umbrella-version",
    "text": "One umbrella version"
  }, {
    "depth": 2,
    "slug": "prove-it-dont-just-read-it",
    "text": "Prove it, don’t just read it"
  }];
}
function _createMdxContent(props) {
  const {Fragment: Fragment$1} = props.components || ({});
  if (!Fragment$1) _missingMdxReference("Fragment");
  return createVNode(Fragment, {
    children: [createVNode(Fragment$1, {
      "set:html": "<p>The <code dir=\"auto\">xNet</code> repository is <strong>one implementation</strong> of XNet. XNet itself is a\n<strong>protocol</strong> — a written interface you can re‑implement in any language, over any\ndatabase, and still interoperate with every other conforming implementation. Like\nMatrix, the AT Protocol, or ActivityPub, the standard is separate from any one\ncodebase.</p>\n"
    }), createVNode($$Aside, {
      type: "tip",
      title: "The normative spec lives in the repo",
      "set:html": "<p>This page is the friendly tour. The <strong>normative source of truth</strong> is\n<a href=\"https://github.com/crs48/xNet/tree/main/docs/specs/protocol\"><code dir=\"auto\">docs/specs/protocol/</code></a> — versioned\nwith the code, backed by a machine‑checked conformance corpus.</p>"
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"the-boundary-in-one-sentence\">The boundary in one sentence</h2><a class=\"sl-anchor-link\" href=\"#the-boundary-in-one-sentence\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “The boundary in one sentence”</span></a></div>\n<blockquote>\n<p>A conforming XNet implementation agrees on the <strong>cryptographic primitives</strong>,\nthe <strong>data model</strong> (especially the byte‑exact canonicalization of a change),\nthe <strong>replication wire format</strong>, and the <strong>authorization semantics</strong> — and\ntreats everything above (query, storage layout, UI, the built‑in app schemas)\nas private.</p>\n</blockquote>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"four-normative-layers\">Four normative layers</h2><a class=\"sl-anchor-link\" href=\"#four-normative-layers\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Four normative layers”</span></a></div>\n<pre class=\"mermaid\" dir=\"ltr\">flowchart TB\n  L4[\"L4 · Application Profile — NON-NORMATIVE\\nbuilt-in schemas, spaces, query, UI\"]\n  L3[\"L3 · Authorization\\nschema rules, roles, grants, UCAN\"]\n  L2[\"L2 · Replication\\nchange relay, signed Yjs envelope, handshake, transports\"]\n  L1[\"L1 · Data Model\\nNode, SchemaIRI, properties, Change, canonicalization, LWW, document codec\"]\n  L0[\"L0 · Primitives\\ndid:key/Ed25519, XChaCha20, X25519, BLAKE3, UCAN\"]\n  L4 --> L3 --> L2 --> L1 --> L0\n</pre>\n"
    }), createVNode($$CardGrid, {
      children: [createVNode($$LinkCard, {
        title: "L0 · Primitives",
        href: "https://github.com/crs48/xNet/blob/main/docs/specs/protocol/01-primitives.md",
        description: "did:key, Ed25519, XChaCha20-Poly1305, X25519, BLAKE3, UCAN — mostly a profile over existing standards."
      }), createVNode($$LinkCard, {
        title: "L1 · Data Model",
        href: "/docs/protocol/data-model/",
        description: "The Node, the signed Change, and the byte-exact canonicalization that makes it all interoperate."
      }), createVNode($$LinkCard, {
        title: "L2 · Replication",
        href: "/docs/protocol/replication/",
        description: "The wire messages, the signed Yjs envelope, and the version handshake."
      }), createVNode($$LinkCard, {
        title: "L3 · Authorization",
        href: "/docs/protocol/authorization/",
        description: "Access control as data: schema rules, role resolvers, grants, and UCAN tokens."
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"the-interop-kernel-the-part-that-makes-it-xnet\">The interop kernel (the part that makes it XNet)</h2><a class=\"sl-anchor-link\" href=\"#the-interop-kernel-the-part-that-makes-it-xnet\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “The interop kernel (the part that makes it XNet)”</span></a></div>\n<p>The irreducible core is small. An implementation that does <strong>only L0 + L1</strong> can\nalready create, sign, verify, and converge nodes — fully participating in the\ngraph:</p>\n<ol>\n<li>A <strong><code dir=\"auto\">did:key</code></strong> identity from an Ed25519 key.</li>\n<li>A <strong>Node</strong> = four universal fields (<code dir=\"auto\">id</code>, <code dir=\"auto\">schemaId</code>, <code dir=\"auto\">createdAt</code>,\n<code dir=\"auto\">createdBy</code>) plus schema‑defined properties.</li>\n<li>A <strong>Change</strong> = a signed, hash‑chained, Lamport‑stamped mutation whose\ncanonical bytes and BLAKE3 hash are specified exactly.</li>\n<li><strong>Last‑Write‑Wins</strong> per‑property conflict resolution on the Lamport clock.</li>\n</ol>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"yjs-is-not-the-protocol\">Yjs is <em>not</em> the protocol</h2><a class=\"sl-anchor-link\" href=\"#yjs-is-not-the-protocol\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Yjs is not the protocol”</span></a></div>\n<p>A common misconception: “XNet is built on Yjs, so I’d have to port a CRDT.” Not\nso. Yjs is used only for the optional rich‑text <strong>document body</strong> of certain\nnodes, and it travels the wire as <strong>opaque bytes inside a signed envelope</strong>. A\nsecond implementation can relay and store that blob without parsing it, and still\nparticipate fully. The CRDT is a <strong>pluggable document codec</strong>, not the\ninterop kernel. (See <a href=\"/docs/protocol/data-model/\">data model</a>.)</p>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"one-umbrella-version\">One umbrella version</h2><a class=\"sl-anchor-link\" href=\"#one-umbrella-version\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “One umbrella version”</span></a></div>\n<p>Peers negotiate a single named bundle — <code dir=\"auto\">xnet/1.0</code> — exactly as Matrix bundles\nbreaking changes into <em>room versions</em>. It expands to the per‑subsystem versions\n(change record, sync envelope, awareness, schema, crypto level). The\nmachine‑readable constant is <code dir=\"auto\">XNET_PROTOCOL_VERSION</code>, exported by <code dir=\"auto\">@xnetjs/sdk</code>.</p>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"prove-it-dont-just-read-it\">Prove it, don’t just read it</h2><a class=\"sl-anchor-link\" href=\"#prove-it-dont-just-read-it\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Prove it, don’t just read it”</span></a></div>\n<p>Every claim in the spec is backed by a <strong>language‑agnostic golden‑vector\ncorpus</strong> shipped <em>with</em> the spec and re‑checked in CI — so the prose can’t drift\nfrom reality. A ~100‑line Python kernel reproduces the same DIDs and verifies\nTypeScript‑signed changes. Want to build your own implementation?</p>\n"
    }), createVNode($$LinkCard, {
      title: "Implement XNet in your language →",
      href: "/docs/protocol/implement-in-your-language/",
      description: "A step-by-step kernel, the golden vectors, and how to claim conformance."
    }), "\n", createVNode($$LinkCard, {
      title: "Languages & SDKs →",
      href: "/docs/languages/overview/",
      description: "TypeScript, Swift, Rust, Python — and the JS frameworks — at honest, labeled maturity levels."
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

const url = "src/content/docs/docs/protocol/overview.mdx";
const file = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/protocol/overview.mdx";
const Content = (props = {}) => MDXContent({
  ...props,
  components: { Fragment: Fragment, ...props.components, },
});
Content[Symbol.for('mdx-component')] = true;
Content[Symbol.for('astro.needsHeadRendering')] = !Boolean(frontmatter.layout);
Content.moduleId = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/protocol/overview.mdx";
__astro_tag_component__(Content, 'astro:jsx');

export { Content, Content as default, file, frontmatter, getHeadings, url };
