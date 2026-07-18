import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$ForestArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ForestArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const fieldRows = [236, 268, 302, 336];
  const fieldCrop = fieldRows.flatMap(
    (y, r) => Array.from({ length: 7 }, (_, c) => ({ x: 58 + c * 66, y, r }))
  );
  const canopy = [
    { cx: 612, cy: 150, rx: 46, ry: 30, fill: "#1f6b3f" },
    { cx: 712, cy: 132, rx: 58, ry: 38, fill: "#175a34" },
    { cx: 838, cy: 146, rx: 52, ry: 34, fill: "#1f6b3f" },
    { cx: 948, cy: 158, rx: 44, ry: 28, fill: "#175a34" }
  ];
  const understory = [
    { cx: 664, cy: 196, rx: 30, ry: 20, fill: "#2f7d4f" },
    { cx: 776, cy: 200, rx: 34, ry: 22, fill: "#2f7d4f" },
    { cx: 898, cy: 198, rx: 28, ry: 19, fill: "#368a57" }
  ];
  const shrubs = [
    { cx: 600, cy: 238, rx: 20, ry: 14, fill: "#3f9d63" },
    { cx: 726, cy: 244, rx: 24, ry: 15, fill: "#3f9d63" },
    { cx: 852, cy: 240, rx: 22, ry: 14, fill: "#46a86c" },
    { cx: 960, cy: 236, rx: 18, ry: 12, fill: "#3f9d63" }
  ];
  const trunks = [
    { x: 612, y: 178 },
    { x: 712, y: 168 },
    { x: 838, y: 178 },
    { x: 948, y: 184 }
  ];
  const herbs = Array.from({ length: 22 }, (_, i) => ({
    x: 566 + i * 21,
    y: 286 + i * 5 % 18,
    o: 0.4 + i * 7 % 5 * 0.1
  }));
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="fhsky" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#0a140d"></stop> <stop offset="60%" stop-color="#0c1812"></stop> <stop offset="100%" stop-color="#0e1f15"></stop> </linearGradient> <linearGradient id="fhfield" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#6b5224"></stop> <stop offset="100%" stop-color="#3d2f14"></stop> </linearGradient> <linearGradient id="fhforest" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#123b22"></stop> <stop offset="100%" stop-color="#08240f"></stop> </linearGradient> <radialGradient id="fhsun" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#fde68a" stop-opacity="0.95"></stop> <stop offset="45%" stop-color="#fbbf24" stop-opacity="0.38"></stop> <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"></stop> </radialGradient> <linearGradient id="fhx" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#fde68a"></stop> <stop offset="100%" stop-color="#34d399"></stop> </linearGradient> </defs> <rect width="1040" height="360" fill="url(#fhsky)"></rect> <!-- the sun, low and warm, falling on the living half --> <g transform="translate(548 70)"> <circle cx="0" cy="0" r="116" fill="url(#fhsun)"></circle> </g> <!-- left: the monocrop field — bare soil, dead-straight furrows --> <rect x="0" y="200" width="520" height="160" fill="url(#fhfield)"></rect> <g stroke="#2c2210" stroke-width="1.4" opacity="0.5"> <line x1="-20" y1="224" x2="540" y2="214"></line> <line x1="-20" y1="256" x2="540" y2="248"></line> <line x1="-20" y1="292" x2="540" y2="286"></line> <line x1="-20" y1="330" x2="540" y2="326"></line> </g> <!-- identical sprouts on a rigid grid; every one the same --> <g stroke="#9bbf4a" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.9"> ${fieldCrop.map((s) => renderTemplate`<g${addAttribute(`translate(${s.x} ${s.y})`, "transform")}> <line x1="0" y1="0" x2="0" y2="-12"></line> <line x1="0" y1="-7" x2="-6" y2="-13"></line> <line x1="0" y1="-7" x2="6" y2="-13"></line> </g>`)} </g> <!-- right: the food forest — layered, varied, nothing in rows --> <rect x="520" y="200" width="520" height="160" fill="url(#fhforest)"></rect> <g stroke="#3a2a12" stroke-width="5" stroke-linecap="round" opacity="0.6"> ${trunks.map((t) => renderTemplate`<line${addAttribute(t.x, "x1")}${addAttribute(t.y, "y1")}${addAttribute(t.x, "x2")}${addAttribute(t.y + 56, "y2")}></line>`)} </g> <g> ${canopy.map((e) => renderTemplate`<ellipse${addAttribute(e.cx, "cx")}${addAttribute(e.cy, "cy")}${addAttribute(e.rx, "rx")}${addAttribute(e.ry, "ry")}${addAttribute(e.fill, "fill")}></ellipse>`)} ${understory.map((e) => renderTemplate`<ellipse${addAttribute(e.cx, "cx")}${addAttribute(e.cy, "cy")}${addAttribute(e.rx, "rx")}${addAttribute(e.ry, "ry")}${addAttribute(e.fill, "fill")}></ellipse>`)} ${shrubs.map((e) => renderTemplate`<ellipse${addAttribute(e.cx, "cx")}${addAttribute(e.cy, "cy")}${addAttribute(e.rx, "rx")}${addAttribute(e.ry, "ry")}${addAttribute(e.fill, "fill")}></ellipse>`)} </g> <g fill="#5cc07e"> ${herbs.map((h) => renderTemplate`<circle${addAttribute(h.x, "cx")}${addAttribute(h.y, "cy")} r="3.2"${addAttribute(h.o, "opacity")}></circle>`)} </g> <!-- the cosmic-X, the brightest node, riding in the sun over the forest --> <g transform="translate(548 70)"> <g stroke="url(#fhx)" stroke-width="5" stroke-linecap="round" transform="translate(-11 -13)"> <line x1="0" y1="0" x2="22" y2="26"></line> <line x1="22" y1="0" x2="0" y2="26"></line> </g> </g> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/ForestArt.astro", void 0);

export { $$ForestArt as $ };
