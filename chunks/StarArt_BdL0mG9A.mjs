import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$StarArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$StarArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const cx = 545;
  const cy = 150;
  const STEP = Math.PI / 4;
  const radiation = Array.from({ length: 8 }, (_, k) => {
    const a = k * STEP;
    return {
      x1: cx + Math.cos(a) * 60,
      y1: cy + Math.sin(a) * 60,
      x2: cx + Math.cos(a) * 88,
      y2: cy + Math.sin(a) * 88
    };
  });
  const gravity = Array.from({ length: 8 }, (_, k) => {
    const a = k * STEP + STEP / 2;
    return {
      x1: cx + Math.cos(a) * 124,
      y1: cy + Math.sin(a) * 124,
      x2: cx + Math.cos(a) * 100,
      y2: cy + Math.sin(a) * 100
    };
  });
  const orbits = [
    { rx: 175, ry: 58 },
    { rx: 250, ry: 84 },
    { rx: 330, ry: 110 }
  ];
  const planets = [
    { rx: 175, ry: 58, t: 0.62, r: 3 },
    { rx: 250, ry: 84, t: 2.3, r: 4 },
    { rx: 330, ry: 110, t: 3.9, r: 2.6 }
  ];
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="space" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#0a0812"></stop> <stop offset="55%" stop-color="#0d0a16"></stop> <stop offset="100%" stop-color="#080610"></stop> </linearGradient> <radialGradient id="starglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.95"></stop> <stop offset="45%" stop-color="#f59e0b" stop-opacity="0.45"></stop> <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"></stop> </radialGradient> <linearGradient id="starx" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#fde68a"></stop> <stop offset="100%" stop-color="#fb923c"></stop> </linearGradient> <marker id="rad" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"> <path d="M0 0 L10 5 L0 10 z" fill="#fbbf24" opacity="0.85"></path> </marker> <marker id="grav" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"> <path d="M0 0 L10 5 L0 10 z" fill="#64748b" opacity="0.85"></path> </marker> </defs> <rect width="1040" height="340" fill="url(#space)"></rect> <!-- starfield --> <g fill="#e9d5ff" opacity="0.65"> <circle cx="80" cy="50" r="1.1"></circle> <circle cx="200" cy="100" r="0.8"></circle> <circle cx="330" cy="42" r="1.3"></circle> <circle cx="160" cy="200" r="0.9"></circle> <circle cx="900" cy="60" r="1.2"></circle> <circle cx="820" cy="120" r="0.8"></circle> <circle cx="980" cy="190" r="1"></circle> <circle cx="720" cy="40" r="0.9"></circle> <circle cx="60" cy="280" r="0.8"></circle> <circle cx="970" cy="300" r="1.1"></circle> <circle cx="420" cy="300" r="0.7"></circle> <circle cx="640" cy="280" r="0.8"></circle> </g> <!-- the orbits the star provides for --> <g stroke="#3b3357" stroke-width="1" fill="none" opacity="0.7"> ${orbits.map((o) => renderTemplate`<ellipse${addAttribute(cx, "cx")}${addAttribute(cy, "cy")}${addAttribute(o.rx, "rx")}${addAttribute(o.ry, "ry")}></ellipse>`)} </g> <g fill="#a78bfa"> ${planets.map((p) => renderTemplate`<circle${addAttribute(cx + Math.cos(p.t) * p.rx, "cx")}${addAttribute(cy + Math.sin(p.t) * p.ry, "cy")}${addAttribute(p.r, "r")}></circle>`)} </g> <!-- gravity pulling in (slate) vs. radiation pushing out (amber): equilibrium --> <g stroke="#64748b" stroke-width="1.6" opacity="0.7"> ${gravity.map((l) => renderTemplate`<line${addAttribute(l.x1, "x1")}${addAttribute(l.y1, "y1")}${addAttribute(l.x2, "x2")}${addAttribute(l.y2, "y2")} marker-end="url(#grav)"></line>`)} </g> <g stroke="#fbbf24" stroke-width="1.6" opacity="0.85"> ${radiation.map((l) => renderTemplate`<line${addAttribute(l.x1, "x1")}${addAttribute(l.y1, "y1")}${addAttribute(l.x2, "x2")}${addAttribute(l.y2, "y2")} marker-end="url(#rad)"></line>`)} </g> <!-- the cosmic-X, glowing as the star at the centre of it all --> <g${addAttribute(`translate(${cx} ${cy})`, "transform")}> <circle cx="0" cy="0" r="58" fill="url(#starglow)"></circle> <g stroke="url(#starx)" stroke-width="6" stroke-linecap="round" transform="translate(-13 -15)"> <line x1="0" y1="0" x2="26" y2="30"></line> <line x1="26" y1="0" x2="0" y2="30"></line> </g> </g> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/StarArt.astro", void 0);

export { $$StarArt as $ };
