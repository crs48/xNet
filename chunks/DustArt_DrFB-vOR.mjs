import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$DustArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$DustArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const P0 = { x: 235, y: 188 };
  const C = { x: 545, y: 40 };
  const P2 = { x: 805, y: 150 };
  const bez = (t) => {
    const u = 1 - t;
    return {
      x: u * u * P0.x + 2 * u * t * C.x + t * t * P2.x,
      y: u * u * P0.y + 2 * u * t * C.y + t * t * P2.y
    };
  };
  const motes = Array.from({ length: 36 }, (_, i) => {
    const t = i / 35;
    const p = bez(t);
    const j = i * 7 % 5;
    return {
      x: p.x + (j - 2) * 3.2,
      y: p.y + (i * 3 % 7 - 3),
      r: 2.7 - t * 1.4,
      // thins out as it crosses
      o: 0.72 - t * 0.34
    };
  });
  const xMote = bez(0.5);
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="dustsky" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#120c08"></stop> <stop offset="55%" stop-color="#16100a"></stop> <stop offset="100%" stop-color="#0c1410"></stop> </linearGradient> <linearGradient id="dunes" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#c2842f"></stop> <stop offset="100%" stop-color="#7c4f1c"></stop> </linearGradient> <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#0e2a3a"></stop> <stop offset="100%" stop-color="#08161f"></stop> </linearGradient> <linearGradient id="canopy" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#1f6b3f"></stop> <stop offset="100%" stop-color="#0c2f1c"></stop> </linearGradient> <radialGradient id="dustglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#fcd34d" stop-opacity="0.95"></stop> <stop offset="45%" stop-color="#f59e0b" stop-opacity="0.4"></stop> <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"></stop> </radialGradient> <linearGradient id="dustx" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#fde68a"></stop> <stop offset="100%" stop-color="#34d399"></stop> </linearGradient> </defs> <rect width="1040" height="340" fill="url(#dustsky)"></rect> <!-- the ocean between two worlds --> <rect x="0" y="206" width="1040" height="134" fill="url(#ocean)"></rect> <g stroke="#1c4a5e" stroke-width="1" opacity="0.5"> <line x1="300" y1="250" x2="760" y2="250"></line> <line x1="340" y1="285" x2="720" y2="285"></line> <line x1="380" y1="318" x2="680" y2="318"></line> </g> <!-- left: the Sahara, dunes that look dead but carry the cargo --> <path d="M0 206 Q70 168 150 184 Q210 196 250 176 Q280 162 300 206 L300 340 L0 340 Z" fill="url(#dunes)" opacity="0.95"></path> <g stroke="#5c3a14" stroke-width="1" opacity="0.4" fill="none"> <path d="M30 250 Q120 232 210 250"></path> <path d="M40 290 Q140 274 250 292"></path> </g> <!-- right: the Amazon, the canopy the dust keeps alive --> <path d="M760 206 Q800 168 850 184 Q910 200 970 176 Q1010 162 1040 196 L1040 340 L760 340 Z" fill="url(#canopy)" opacity="0.95"></path> <g fill="#0f3b22"> <ellipse cx="812" cy="176" rx="34" ry="20"></ellipse> <ellipse cx="892" cy="166" rx="44" ry="24"></ellipse> <ellipse cx="968" cy="172" rx="32" ry="19"></ellipse> </g> <g stroke="#0a2716" stroke-width="3" stroke-linecap="round" opacity="0.7"> <line x1="812" y1="190" x2="812" y2="214"></line> <line x1="892" y1="186" x2="892" y2="214"></line> <line x1="968" y1="188" x2="968" y2="214"></line> </g> <!-- the dust bridge: a translucent ribbon under a scatter of phosphorus motes --> <path d="M235 188 Q545 40 805 150" fill="none" stroke="#d9a441" stroke-width="10" stroke-linecap="round" opacity="0.16"></path> <path d="M235 188 Q545 40 805 150" fill="none" stroke="#f1c25a" stroke-width="3" stroke-linecap="round" opacity="0.28"></path> <g fill="#fcd9a0"> ${motes.map((m) => renderTemplate`<circle${addAttribute(m.x, "cx")}${addAttribute(m.y, "cy")}${addAttribute(m.r, "r")}${addAttribute(m.o, "opacity")}></circle>`)} </g> <!-- the cosmic-X, glowing as the brightest mote mid-crossing --> <g${addAttribute(`translate(${xMote.x} ${xMote.y})`, "transform")}> <circle cx="0" cy="0" r="44" fill="url(#dustglow)"></circle> <g stroke="url(#dustx)" stroke-width="5" stroke-linecap="round" transform="translate(-11 -13)"> <line x1="0" y1="0" x2="22" y2="26"></line> <line x1="22" y1="0" x2="0" y2="26"></line> </g> </g> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/DustArt.astro", void 0);

export { $$DustArt as $ };
