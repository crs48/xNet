import { g as createVNode, F as Fragment, _ as __astro_tag_component__ } from './astro/server_CDqOe6mW.mjs';
import { g as $$Aside, f as $$Badge, a as $$LinkCard } from './Code_DejOdlcC.mjs';

const frontmatter = {
  "title": "Languages & SDKs",
  "draft": false,
  "description": "Build xNet apps in TypeScript, React, Swift, Rust, Vue, Svelte, or any language. One protocol, verified by the same golden vectors — at honest, labeled maturity levels.",
  "sidebar": {
    "order": 0,
    "label": "Overview & matrix"
  }
};
function getHeadings() {
  return [{
    "depth": 2,
    "slug": "the-two-axes",
    "text": "The two axes"
  }, {
    "depth": 2,
    "slug": "maturity-matrix",
    "text": "Maturity matrix"
  }, {
    "depth": 3,
    "slug": "languages",
    "text": "Languages"
  }, {
    "depth": 3,
    "slug": "javascript-ui-frameworks",
    "text": "JavaScript UI frameworks"
  }, {
    "depth": 2,
    "slug": "pick-your-path",
    "text": "Pick your path"
  }];
}
function _createMdxContent(props) {
  const _components = {
    code: "code",
    p: "p",
    strong: "strong",
    table: "table",
    tbody: "tbody",
    td: "td",
    th: "th",
    thead: "thead",
    tr: "tr",
    ...props.components
  }, {Fragment: Fragment$1} = _components;
  if (!Fragment$1) _missingMdxReference("Fragment");
  return createVNode(Fragment, {
    children: [createVNode(Fragment$1, {
      "set:html": "<p>xNet is a <strong>protocol</strong> first and an app second. The same signed, hash-chained,\nlast-write-wins data model can be implemented — and <strong>proven byte-for-byte</strong> —\nin more than one language, and the JavaScript runtime binds to more than one UI\nframework. This page is the honest map of what exists today and how mature it is.</p>\n"
    }), createVNode($$Aside, {
      type: "tip",
      title: "You don't have to trust us — you can check",
      "set:html": "<p>Every implementation below passes the <strong>same <a href=\"/docs/protocol/conformance/\">golden vectors</a></strong>:\nidentity (<code dir=\"auto\">did:key</code>), the canonical-JSON BLAKE3 change hash, signing, and LWW convergence. That\nshared corpus is the difference between “supported” and “verifiably interoperable.”</p>"
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"the-two-axes\">The two axes</h2><a class=\"sl-anchor-link\" href=\"#the-two-axes\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “The two axes”</span></a></div>\n<p>There are two different “multi-X” stories, and they mean different things:</p>\n<ul>\n<li><strong>Languages</strong> implement the <a href=\"/docs/protocol/overview/\">protocol</a> (identity,\nchange hashing, replication, authorization) and interoperate over the wire.</li>\n<li><strong>JavaScript UI frameworks</strong> bind the same JS <a href=\"/docs/architecture/package-graph/\">runtime</a>\n(<code dir=\"auto\">createXNetClient</code> + <code dir=\"auto\">liveQuery</code>) into React, Vue, Svelte, or Solid.</li>\n</ul>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"maturity-matrix\">Maturity matrix</h2><a class=\"sl-anchor-link\" href=\"#maturity-matrix\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Maturity matrix”</span></a></div>\n"
    }), createVNode(_components.p, {
      children: ["What the badges mean: ", createVNode($$Badge, {
        text: "Reference",
        variant: "tip"
      }), " the canonical\nimplementation the vectors are generated from · ", createVNode($$Badge, {
        text: "Stable SDK",
        variant: "success"
      }), "\nfirst-class and app-ready · ", createVNode($$Badge, {
        text: "Beta",
        variant: "note"
      }), " real and\nconformance-pinned, still evolving · ", createVNode($$Badge, {
        text: "On demand",
        variant: "caution"
      }), "\na thin binding published when asked for · ", createVNode($$Badge, {
        text: "Reference kernel",
        variant: "default"
      }), "\na verifier / teaching implementation."]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h3\"><h3 id=\"languages\">Languages</h3><a class=\"sl-anchor-link\" href=\"#languages\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Languages”</span></a></div>\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n"
    }), createVNode(_components.table, {
      children: [createVNode(_components.thead, {
        children: createVNode(_components.tr, {
          children: [createVNode(_components.th, {
            children: "Language"
          }), createVNode(_components.th, {
            children: "What you get"
          }), createVNode(_components.th, {
            children: "Maturity"
          }), createVNode(_components.th, {
            children: "Where"
          })]
        })
      }), createVNode(_components.tbody, {
        children: [createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "TypeScript"
            })
          }), createVNode(_components.td, {
            children: "The full runtime + React SDK, published to npm"
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Reference",
              variant: "tip"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/quickstart/\">Quickstart</a>"
          })]
        }), createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "Swift"
            })
          }), createVNode(_components.td, {
            children: "Native SDK — schemas, store, query, SwiftUI live binding, SQLite"
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Native SDK · beta",
              variant: "note"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/languages/swift/\">Swift</a>"
          })]
        }), createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "Rust"
            })
          }), createVNode(_components.td, {
            children: "Portable interop kernel + C/UniFFI binding surface"
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Core · beta",
              variant: "note"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/languages/rust/\">Rust</a>"
          })]
        }), createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "Python"
            })
          }), createVNode(_components.td, {
            children: "~100-line reference kernel + vector verifier"
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Reference kernel",
              variant: "default"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/protocol/implement-in-your-language/\">Implement it</a>"
          })]
        }), createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "Any language"
            })
          }), createVNode(_components.td, {
            children: "Build a conforming impl from the spec + vectors"
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "DIY",
              variant: "default"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/protocol/implement-in-your-language/\">Implement it</a>"
          })]
        })]
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h3\"><h3 id=\"javascript-ui-frameworks\">JavaScript UI frameworks</h3><a class=\"sl-anchor-link\" href=\"#javascript-ui-frameworks\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “JavaScript UI frameworks”</span></a></div>\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n"
    }), createVNode(_components.table, {
      children: [createVNode(_components.thead, {
        children: createVNode(_components.tr, {
          children: [createVNode(_components.th, {
            children: "Framework"
          }), createVNode(_components.th, {
            children: "What you get"
          }), createVNode(_components.th, {
            children: "Maturity"
          }), createVNode(_components.th, {
            children: "Where"
          })]
        })
      }), createVNode(_components.tbody, {
        children: [createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "React"
            })
          }), createVNode(_components.td, {
            children: ["Hooks ", createVNode(_components.strong, {
              children: "and"
            }), " components — the toolkit the app itself uses"]
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Stable SDK",
              variant: "success"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/hooks/overview/\">React hooks</a>"
          })]
        }), createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "Vue"
            })
          }), createVNode(_components.td, {
            children: [createVNode(_components.code, {
              dir: "auto",
              children: "useQuery"
            }), " / ", createVNode(_components.code, {
              dir: "auto",
              children: "useMutate"
            }), " data binding (no components)"]
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Adapter · on demand",
              variant: "caution"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/guides/frameworks/\">Frameworks</a>"
          })]
        }), createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "Svelte"
            })
          }), createVNode(_components.td, {
            children: [createVNode(_components.code, {
              dir: "auto",
              children: "liveQuery"
            }), " is already a Svelte store"]
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Adapter · on demand",
              variant: "caution"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/guides/frameworks/\">Frameworks</a>"
          })]
        }), createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "Solid"
            })
          }), createVNode(_components.td, {
            children: [createVNode(_components.code, {
              dir: "auto",
              children: "createQuery"
            }), " via ", createVNode(_components.code, {
              dir: "auto",
              children: "from()"
            })]
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Adapter · on demand",
              variant: "caution"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/guides/frameworks/\">Frameworks</a>"
          })]
        }), createVNode(_components.tr, {
          children: [createVNode(_components.td, {
            children: createVNode(_components.strong, {
              children: "Vanilla / Lit / Angular"
            })
          }), createVNode(_components.td, {
            children: ["Subscribe to ", createVNode(_components.code, {
              dir: "auto",
              children: "liveQuery"
            }), " directly"]
          }), createVNode(_components.td, {
            children: createVNode($$Badge, {
              text: "Pattern",
              variant: "default"
            })
          }), createVNode(_components.td, {
            "set:html": "<a href=\"/docs/guides/frameworks/\">Frameworks</a>"
          })]
        })]
      })]
    }), "\n", createVNode($$Aside, {
      type: "note",
      title: "Honest scope",
      "set:html": "<p>Only <strong>React</strong> ships UI components; the component kit is React by design (see the <a href=\"/docs/guides/frameworks/\">framework\nsupport policy</a>). The Swift and Rust packages live <strong>in the repo</strong>\n(SwiftPM / Cargo), not on a public registry yet — the per-language pages show how to depend on\nthem today.</p>"
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"pick-your-path\">Pick your path</h2><a class=\"sl-anchor-link\" href=\"#pick-your-path\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Pick your path”</span></a></div>\n"
    }), createVNode($$LinkCard, {
      title: "JavaScript frameworks →",
      href: "/docs/guides/frameworks/",
      description: "React, Vue, Svelte, Solid, or vanilla — bind the runtime in ~40 lines."
    }), "\n", createVNode($$LinkCard, {
      title: "Swift — XNetKit →",
      href: "/docs/languages/swift/",
      description: "Define schemas in Swift and bind queries into a SwiftUI re-render loop."
    }), "\n", createVNode($$LinkCard, {
      title: "Rust — xnet-core →",
      href: "/docs/languages/rust/",
      description: "The portable interop kernel that backs native SDKs, with C/UniFFI bindings."
    }), "\n", createVNode($$LinkCard, {
      title: "Implement it in any language →",
      href: "/docs/protocol/implement-in-your-language/",
      description: "The kernel, the golden vectors, and how to claim conformance."
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

const url = "src/content/docs/docs/languages/overview.mdx";
const file = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/languages/overview.mdx";
const Content = (props = {}) => MDXContent({
  ...props,
  components: { Fragment: Fragment, ...props.components, },
});
Content[Symbol.for('mdx-component')] = true;
Content[Symbol.for('astro.needsHeadRendering')] = !Boolean(frontmatter.layout);
Content.moduleId = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/languages/overview.mdx";
__astro_tag_component__(Content, 'astro:jsx');

export { Content, Content as default, file, frontmatter, getHeadings, url };
