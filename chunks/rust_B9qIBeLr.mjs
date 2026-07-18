import { g as createVNode, F as Fragment, _ as __astro_tag_component__ } from './astro/server_CDqOe6mW.mjs';
import { f as $$Badge, g as $$Aside, a as $$LinkCard } from './Code_DejOdlcC.mjs';

const frontmatter = {
  "title": "Rust — xnet-core",
  "draft": false,
  "description": "xnet-core is a portable Rust implementation of the xNet interop kernel: did:key identity, the canonical-JSON BLAKE3 change hash, deterministic Ed25519, LWW convergence, and the L2/L3 decision functions — with a C/UniFFI binding surface to back native SDKs.",
  "sidebar": {
    "order": 4,
    "label": "Rust"
  }
};
function getHeadings() {
  return [{
    "depth": 2,
    "slug": "conformance",
    "text": "Conformance"
  }, {
    "depth": 2,
    "slug": "the-binding-surface",
    "text": "The binding surface"
  }, {
    "depth": 2,
    "slug": "scope--status",
    "text": "Scope & status"
  }];
}
function _createMdxContent(props) {
  const _components = {
    p: "p",
    ...props.components
  }, {Fragment: Fragment$1} = _components;
  if (!Fragment$1) _missingMdxReference("Fragment");
  return createVNode(Fragment, {
    children: [createVNode(_components.p, {
      children: [createVNode($$Badge, {
        text: "Core · beta",
        variant: "note"
      }), createVNode($$Badge, {
        text: "regenerates the golden vectors",
        variant: "tip"
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<p><a href=\"https://github.com/crs48/xNet/tree/main/rust/xnet-core\"><strong>xnet-core</strong></a> is a\nportable Rust implementation of the xNet <strong>interop kernel</strong> — the byte-exact core\nof the <a href=\"/docs/protocol/overview/\">protocol</a>: <code dir=\"auto\">did:key</code> identity, the canonical-JSON\nchange hash, Ed25519 sign/verify, per-property LWW convergence, and the pure\nL2/L3 decision functions (version negotiation, authorization expression\nevaluation).</p>\n<p>Unlike a full app SDK, <code dir=\"auto\">xnet-core</code> is the <strong>kernel + a binding surface</strong>. It’s\nPhase 2 of <a href=\"https://github.com/crs48/xNet/blob/main/docs/explorations/0210_%5B_%5D_NATIVE_SWIFT_SDK_AND_PORTABLE_MULTI_LANGUAGE_CORE.md\">exploration 0210</a>:\none portable core that can back the Swift, Kotlin, and .NET SDKs via UniFFI / a C\nABI, instead of each language re-implementing the kernel.</p>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"conformance\">Conformance</h2><a class=\"sl-anchor-link\" href=\"#conformance\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Conformance”</span></a></div>\n<p><code dir=\"auto\">cargo test</code> runs the <strong>shared golden-vector corpus</strong> (<a href=\"/docs/protocol/conformance/\"><code dir=\"auto\">conformance/vectors/</code></a>)\n— the same vectors the TypeScript reference and the Python/Swift kernels pass:</p>\n<div class=\"expressive-code\"><link rel=\"stylesheet\" href=\"/_astro/ec.n7yu4.css\"><script type=\"module\" src=\"/_astro/ec.0vx5m.js\"></script><figure class=\"frame not-content\"><figcaption class=\"header\"></figcaption><pre data-language=\"text\"><code><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#383a42;--1:#abb2bf\">test l0_identity ... ok      # did:key derivation + round-trip</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#383a42;--1:#abb2bf\">test l1_change ... ok        # canonical JSON, BLAKE3 hash, verify, AND re-sign</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#383a42;--1:#abb2bf\">test l1_lww ... ok           # per-property LWW convergence</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#383a42;--1:#abb2bf\">test l2_replication ... ok   # version-handshake negotiation + catch-up filter</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#383a42;--1:#abb2bf\">test l3_authz ... ok         # authorization expression-AST evaluation</span></div></div></code></pre><div class=\"copy\"><div aria-live=\"polite\"></div><button title=\"Copy to clipboard\" data-copied=\"Copied!\" data-code=\"test l0_identity ... ok      # did:key derivation + round-triptest l1_change ... ok        # canonical JSON, BLAKE3 hash, verify, AND re-signtest l1_lww ... ok           # per-property LWW convergencetest l2_replication ... ok   # version-handshake negotiation + catch-up filtertest l3_authz ... ok         # authorization expression-AST evaluation\"><div></div></button></div></figure></div>\n"
    }), createVNode($$Aside, {
      type: "tip",
      title: "Re-sign, byte-for-byte",
      "set:html": "<p><code dir=\"auto\">xnet-core</code> reproduces a TypeScript-produced signature <strong>exactly</strong> — Ed25519 here is the\ndeterministic RFC-8032 construction on <code dir=\"auto\">curve25519-dalek</code> + <code dir=\"auto\">sha2</code>, so the only crypto\ndependencies are audited group-math and hash primitives (base58btc and canonical JSON are inline).\nThat makes Rust a candidate for <strong>regenerating</strong> the golden vectors, not just verifying them.</p>"
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"expressive-code\"><figure class=\"frame is-terminal not-content\"><figcaption class=\"header\"><span class=\"title\"></span><span class=\"sr-only\">Terminal window</span></figcaption><pre data-language=\"bash\"><code><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#016C9A;--1:#56B6C2\">cd</span><span style=\"--0:#383A42;--1:#ABB2BF\"> </span><span style=\"--0:#387138;--1:#98C379\">rust/xnet-core</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#3360C1;--1:#61AFEF\">cargo</span><span style=\"--0:#383A42;--1:#ABB2BF\"> </span><span style=\"--0:#387138;--1:#98C379\">test</span><span style=\"--0:#383A42;--1:#ABB2BF\">          </span><span style=\"--0:#646568;--0fs:italic;--1:#9FA3AA;--1fs:italic\"># 5 conformance suites + 1 FFI round-trip</span></div></div></code></pre><div class=\"copy\"><div aria-live=\"polite\"></div><button title=\"Copy to clipboard\" data-copied=\"Copied!\" data-code=\"cd rust/xnet-corecargo test          # 5 conformance suites + 1 FFI round-trip\"><div></div></button></div></figure></div>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"the-binding-surface\">The binding surface</h2><a class=\"sl-anchor-link\" href=\"#the-binding-surface\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “The binding surface”</span></a></div>\n<p><a href=\"https://github.com/crs48/xNet/blob/main/rust/xnet-core/src/ffi.rs\"><code dir=\"auto\">src/ffi.rs</code></a>\nexposes the kernel across a <code dir=\"auto\">String</code> / <code dir=\"auto\">Vec&#x3C;u8></code> / <code dir=\"auto\">bool</code> boundary — the shape a\nUniFFI or C-ABI consumer wants — so a native SDK (Swift, Kotlin, .NET) can call\nthe verified kernel instead of porting it. The crate is dependency-light by\ndesign:</p>\n<div class=\"expressive-code\"><figure class=\"frame not-content\"><figcaption class=\"header\"></figcaption><pre data-language=\"toml\"><code><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#383A42;--1:#ABB2BF\">[</span><span style=\"--0:#3360C1;--1:#61AFEF\">dependencies</span><span style=\"--0:#383A42;--1:#ABB2BF\">]</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#AF4238;--1:#E6888F\">curve25519-dalek</span><span style=\"--0:#383A42;--1:#ABB2BF\"> = </span><span style=\"--0:#387138;--1:#98C379\">\"4.1\"</span><span style=\"--0:#383A42;--1:#ABB2BF\">   </span><span style=\"--0:#646568;--0fs:italic;--1:#9FA3AA;--1fs:italic\"># RFC-8032 Ed25519 (deterministic)</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#AF4238;--1:#E6888F\">sha2</span><span style=\"--0:#383A42;--1:#ABB2BF\"> = </span><span style=\"--0:#387138;--1:#98C379\">\"0.10\"</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#AF4238;--1:#E6888F\">blake3</span><span style=\"--0:#383A42;--1:#ABB2BF\"> = </span><span style=\"--0:#387138;--1:#98C379\">\"1\"</span><span style=\"--0:#383A42;--1:#ABB2BF\">               </span><span style=\"--0:#646568;--0fs:italic;--1:#9FA3AA;--1fs:italic\"># the change-hash digest</span></div></div><div class=\"ec-line\"><div class=\"code\"><span style=\"--0:#AF4238;--1:#E6888F\">serde_json</span><span style=\"--0:#383A42;--1:#ABB2BF\"> = </span><span style=\"--0:#387138;--1:#98C379\">\"1\"</span></div></div></code></pre><div class=\"copy\"><div aria-live=\"polite\"></div><button title=\"Copy to clipboard\" data-copied=\"Copied!\" data-code=\"[dependencies]curve25519-dalek = &#x22;4.1&#x22;   # RFC-8032 Ed25519 (deterministic)sha2 = &#x22;0.10&#x22;blake3 = &#x22;1&#x22;               # the change-hash digestserde_json = &#x22;1&#x22;\"><div></div></button></div></figure></div>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"scope--status\">Scope &#x26; status</h2><a class=\"sl-anchor-link\" href=\"#scope--status\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Scope &#x26; status”</span></a></div>\n"
    }), createVNode($$Aside, {
      type: "caution",
      title: "Kernel, not a full app SDK",
      "set:html": "<p>xnet-core is the <strong>L0/L1 + L2/L3 decision core</strong> — identity, change hashing, LWW, and the pure\ndecision functions. It is not (yet) an application SDK with storage, a live-sync transport, or a\nquery engine; those live in the native SDKs it’s meant to back. The crate lives <strong>in the\nrepository</strong> (not yet on crates.io).</p>"
    }), "\n", createVNode($$LinkCard, {
      title: "xnet-core source & tests →",
      href: "https://github.com/crs48/xNet/tree/main/rust/xnet-core",
      description: "The kernel (src/lib.rs), the FFI surface (src/ffi.rs), and the conformance tests."
    }), "\n", createVNode($$LinkCard, {
      title: "Implement xNet in your language →",
      href: "/docs/protocol/implement-in-your-language/",
      description: "The same path xnet-core followed — kernel, vectors, conformance."
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

const url = "src/content/docs/docs/languages/rust.mdx";
const file = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/languages/rust.mdx";
const Content = (props = {}) => MDXContent({
  ...props,
  components: { Fragment: Fragment, ...props.components, },
});
Content[Symbol.for('mdx-component')] = true;
Content[Symbol.for('astro.needsHeadRendering')] = !Boolean(frontmatter.layout);
Content.moduleId = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/languages/rust.mdx";
__astro_tag_component__(Content, 'astro:jsx');

export { Content, Content as default, file, frontmatter, getHeadings, url };
