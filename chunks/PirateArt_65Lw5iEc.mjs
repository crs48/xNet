import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$PirateArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$PirateArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const islands = [
    { x: 120, y: 250, r: 10 },
    { x: 250, y: 215, r: 7 },
    { x: 400, y: 260, r: 13 },
    { x: 545, y: 225, r: 8 },
    { x: 680, y: 255, r: 11 },
    { x: 815, y: 220, r: 7 },
    { x: 930, y: 250, r: 12 }
  ];
  const lanes = [
    [0, 2],
    [2, 4],
    [4, 6],
    [2, 3]
  ];
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#0a0a18"></stop> <stop offset="60%" stop-color="#0d1124"></stop> <stop offset="100%" stop-color="#0b1a1f"></stop> </linearGradient> <radialGradient id="glow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#6366f1" stop-opacity="0.9"></stop> <stop offset="100%" stop-color="#6366f1" stop-opacity="0"></stop> </radialGradient> <linearGradient id="xflag" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#818cf8"></stop> <stop offset="100%" stop-color="#34d399"></stop> </linearGradient> </defs> <rect width="1040" height="340" fill="url(#sky)"></rect> <!-- starfield --> <g fill="#c7d2fe" opacity="0.7"> <circle cx="90" cy="55" r="1.1"></circle> <circle cx="190" cy="95" r="0.9"></circle> <circle cx="300" cy="45" r="1.3"></circle> <circle cx="430" cy="80" r="0.8"></circle> <circle cx="560" cy="50" r="1.1"></circle> <circle cx="700" cy="90" r="0.9"></circle> <circle cx="820" cy="40" r="1.2"></circle> <circle cx="950" cy="75" r="1"></circle> <circle cx="640" cy="120" r="0.7"></circle> <circle cx="370" cy="130" r="0.7"></circle> </g> <!-- sea-lanes between a subset of islands --> <g stroke="#475569" stroke-width="1.5" stroke-dasharray="3 6" fill="none" opacity="0.8"> ${lanes.map(([a, b]) => renderTemplate`<line${addAttribute(islands[a].x, "x1")}${addAttribute(islands[a].y, "y1")}${addAttribute(islands[b].x, "x2")}${addAttribute(islands[b].y, "y2")}></line>`)} </g> <!-- islands --> <g> ${islands.map((i) => renderTemplate`<g> <ellipse${addAttribute(i.x, "cx")}${addAttribute(i.y + i.r * 0.6, "cy")}${addAttribute(i.r * 1.6, "rx")}${addAttribute(i.r * 0.5, "ry")} fill="#0f172a"></ellipse> <path${addAttribute(`M ${i.x - i.r * 1.5} ${i.y + i.r * 0.6} Q ${i.x} ${i.y - i.r} ${i.x + i.r * 1.5} ${i.y + i.r * 0.6} Z`, "d")} fill="#1e293b"></path> </g>`)} </g> <!-- horizon sea --> <rect x="0" y="290" width="1040" height="50" fill="#0b1a1f"></rect> <line x1="0" y1="290" x2="1040" y2="290" stroke="#1e3a3a" stroke-width="1"></line> <!-- foreground: a flagpole flying the cosmic-X --> <g transform="translate(150 150)"> <circle cx="40" cy="20" r="70" fill="url(#glow)" opacity="0.5"></circle> <rect x="-2" y="-30" width="4" height="200" fill="#334155"></rect> <path d="M 2 -28 L 96 0 L 2 56 Z" fill="#0f172a" stroke="#1e293b" stroke-width="1"></path> <!-- the X mark on the flag --> <g transform="translate(30 -6)" stroke="url(#xflag)" stroke-width="6" stroke-linecap="round"> <line x1="0" y1="0" x2="28" y2="34"></line> <line x1="28" y1="0" x2="0" y2="34"></line> </g> </g> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/PirateArt.astro", void 0);

export { $$PirateArt as $ };
