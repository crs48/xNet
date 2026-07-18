import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$MycelialArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$MycelialArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const nodes = [
    { x: 150, y: 250, r: 4 },
    { x: 300, y: 210, r: 5 },
    { x: 430, y: 285, r: 4 },
    { x: 545, y: 235, r: 9 },
    // the cosmic-X hub
    { x: 690, y: 280, r: 5 },
    { x: 815, y: 215, r: 4 },
    { x: 930, y: 265, r: 5 }
  ];
  const hyphae = [
    [0, 1],
    [1, 3],
    [0, 3],
    [2, 3],
    [3, 4],
    [3, 5],
    [4, 6],
    [5, 6],
    [1, 2]
  ];
  const filaments = nodes.flatMap(
    (n, i) => [0, 1, 2].map((k) => {
      const angle = (i * 1.7 + k * 2.3) % (Math.PI * 2);
      const len = 18 + (i + k) % 3 * 10;
      return {
        x1: n.x,
        y1: n.y,
        x2: n.x + Math.cos(angle) * len,
        y2: n.y + Math.sin(angle) * len * 0.7
      };
    })
  );
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="substrate" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#0a1410"></stop> <stop offset="45%" stop-color="#0b1a14"></stop> <stop offset="100%" stop-color="#06100c"></stop> </linearGradient> <radialGradient id="myglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#34d399" stop-opacity="0.9"></stop> <stop offset="100%" stop-color="#34d399" stop-opacity="0"></stop> </radialGradient> <linearGradient id="myxflag" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#818cf8"></stop> <stop offset="100%" stop-color="#34d399"></stop> </linearGradient> </defs> <rect width="1040" height="340" fill="url(#substrate)"></rect> <!-- forest floor: a thin canopy strip up top with trunks descending into roots --> <g stroke="#1f3a2e" stroke-width="2" fill="none" opacity="0.8"> <line x1="0" y1="120" x2="1040" y2="120"></line> </g> <g fill="#13241c"> <rect x="190" y="60" width="8" height="60" rx="2"></rect> <rect x="520" y="48" width="10" height="72" rx="2"></rect> <rect x="780" y="66" width="7" height="54" rx="2"></rect> <!-- canopy blobs --> <ellipse cx="194" cy="56" rx="40" ry="22"></ellipse> <ellipse cx="525" cy="44" rx="52" ry="28"></ellipse> <ellipse cx="783" cy="62" rx="34" ry="20"></ellipse> </g> <!-- roots reaching down from the trunks toward the web --> <g stroke="#15281e" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.9"> <path d="M194 120 C 190 150, 170 180, 150 250"></path> <path d="M525 120 C 528 150, 540 190, 545 235"></path> <path d="M783 120 C 786 150, 800 185, 815 215"></path> </g> <!-- fine filaments radiating into the substrate --> <g stroke="#2f6f53" stroke-width="0.8" opacity="0.5"> ${filaments.map((f) => renderTemplate`<line${addAttribute(f.x1, "x1")}${addAttribute(f.y1, "y1")}${addAttribute(f.x2, "x2")}${addAttribute(f.y2, "y2")}></line>`)} </g> <!-- hyphae: the load-bearing threads between hubs --> <g stroke="#3fae7d" stroke-width="1.4" stroke-dasharray="2 5" fill="none" opacity="0.85"> ${hyphae.map(([a, b]) => renderTemplate`<line${addAttribute(nodes[a].x, "x1")}${addAttribute(nodes[a].y, "y1")}${addAttribute(nodes[b].x, "x2")}${addAttribute(nodes[b].y, "y2")}></line>`)} </g> <!-- hub nodes --> <g> ${nodes.map(
    (n, i) => i === 3 ? null : renderTemplate`<circle${addAttribute(n.x, "cx")}${addAttribute(n.y, "cy")}${addAttribute(n.r, "r")} fill="#5eead4" opacity="0.85"></circle>`
  )} </g> <!-- the cosmic-X, glowing as the brightest node in the web --> <g${addAttribute(`translate(${nodes[3].x} ${nodes[3].y})`, "transform")}> <circle cx="0" cy="0" r="46" fill="url(#myglow)" opacity="0.7"></circle> <g stroke="url(#myxflag)" stroke-width="5" stroke-linecap="round" transform="translate(-11 -13)"> <line x1="0" y1="0" x2="22" y2="26"></line> <line x1="22" y1="0" x2="0" y2="26"></line> </g> </g> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/MycelialArt.astro", void 0);

export { $$MycelialArt as $ };
