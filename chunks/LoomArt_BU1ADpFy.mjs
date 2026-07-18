import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$LoomArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$LoomArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const warp = Array.from({ length: 33 }, (_, i) => ({
    x: 20 + i * 31,
    o: 0.16 + i * 7 % 5 * 0.05
  }));
  const weftRows = [150, 168, 186, 204, 222];
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="lhsky" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#080813"></stop> <stop offset="60%" stop-color="#0b0b18"></stop> <stop offset="100%" stop-color="#0d0d1c"></stop> </linearGradient> <radialGradient id="lhglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#a5b4fc" stop-opacity="0.9"></stop> <stop offset="45%" stop-color="#6366f1" stop-opacity="0.35"></stop> <stop offset="100%" stop-color="#6366f1" stop-opacity="0"></stop> </radialGradient> <linearGradient id="lhx" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#fde68a"></stop> <stop offset="100%" stop-color="#818cf8"></stop> </linearGradient> </defs> <rect width="1040" height="360" fill="url(#lhsky)"></rect> <!-- warp: the taut vertical threads of the loom --> <g stroke="#6366f1" stroke-width="1.1"> ${warp.map((t) => renderTemplate`<line${addAttribute(t.x, "x1")} y1="36"${addAttribute(t.x, "x2")} y2="330"${addAttribute(t.o, "opacity")}></line>`)} </g> <!-- the glow behind the shuttle, riding high over the forming cloth --> <g transform="translate(548 104)"> <circle cx="0" cy="0" r="132" fill="url(#lhglow)"></circle> </g> <!-- weft: horizontal threads woven through, brighter where lit --> <g stroke="#a5b4fc" stroke-width="2" stroke-linecap="round" fill="none"> ${weftRows.map((y, r) => renderTemplate`<line x1="120"${addAttribute(y, "y1")} x2="980"${addAttribute(y, "y2")} stroke-dasharray="14 9"${addAttribute(0.28 + r % 2 * 0.22, "opacity")}></line>`)} </g> <!-- finished cloth gathering at the base, denser weave --> <g stroke="#818cf8" stroke-width="1.4" opacity="0.4"> <line x1="120" y1="276" x2="980" y2="276"></line> <line x1="120" y1="290" x2="980" y2="290" stroke-dasharray="8 6"></line> <line x1="120" y1="304" x2="980" y2="304" stroke-dasharray="8 6"></line> </g> <!-- the cosmic-X: the shuttle, the single brightest thread in the weave --> <g transform="translate(548 104)"> <g stroke="url(#lhx)" stroke-width="5.5" stroke-linecap="round" transform="translate(-12 -14)"> <line x1="0" y1="0" x2="24" y2="28"></line> <line x1="24" y1="0" x2="0" y2="28"></line> </g> </g> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/LoomArt.astro", void 0);

export { $$LoomArt as $ };
