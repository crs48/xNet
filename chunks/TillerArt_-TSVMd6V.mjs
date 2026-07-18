import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$TillerArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$TillerArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const star = { x: 838, y: 92 };
  const boat = { x: 300, y: 236 };
  const wake = [
    [64, 250],
    [98, 231],
    [131, 251],
    [165, 233],
    [199, 248],
    [232, 234],
    [265, 245],
    [298, 237]
  ].map(([x, y]) => `${x},${y}`).join(" ");
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="tillerbg" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#071a28"></stop> <stop offset="52%" stop-color="#0a2233"></stop> <stop offset="62%" stop-color="#08202f"></stop> <stop offset="100%" stop-color="#050f18"></stop> </linearGradient> <radialGradient id="starglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.95"></stop> <stop offset="45%" stop-color="#38bdf8" stop-opacity="0.4"></stop> <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"></stop> </radialGradient> <linearGradient id="starx" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#e0f2fe"></stop> <stop offset="100%" stop-color="#38bdf8"></stop> </linearGradient> </defs> <rect width="1040" height="340" fill="url(#tillerbg)"></rect> <!-- a scatter of faint stars in the night sky --> <g fill="#7dd3fc" opacity="0.5"> <circle cx="140" cy="60" r="1.4"></circle> <circle cx="360" cy="42" r="1.1"></circle> <circle cx="520" cy="80" r="1.5"></circle> <circle cx="690" cy="52" r="1.2"></circle> <circle cx="930" cy="150" r="1.3"></circle> <circle cx="255" cy="110" r="1"></circle> <circle cx="612" cy="150" r="1"></circle> </g> <!-- the sea: horizon and a few settling swells --> <g stroke="#1e5068" stroke-width="1.4" opacity="0.55" fill="none" stroke-linecap="round"> <line x1="0" y1="212" x2="1040" y2="212" opacity="0.7"></line> <path d="M0 250 Q 130 242 260 250 T 520 250 T 780 250 T 1040 250" opacity="0.5"></path> <path d="M0 288 Q 150 279 300 288 T 600 288 T 900 288 T 1040 288" opacity="0.35"></path> </g> <!-- the intended course: a faint bearing line from the boat to the guiding star --> <line${addAttribute(boat.x, "x1")}${addAttribute(boat.y - 6, "y1")}${addAttribute(star.x, "x2")}${addAttribute(star.y + 18, "y2")} stroke="#38bdf8" stroke-width="1.4" stroke-dasharray="2 7" opacity="0.5"></line> <!-- the wake: the course already sailed — constant small corrections, converging --> <polyline${addAttribute(wake, "points")} fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 6" opacity="0.75"></polyline> <!-- the boat, heeled slightly to the wind, holding its line --> <g${addAttribute(`translate(${boat.x} ${boat.y}) rotate(-6)`, "transform")}> <!-- hull --> <path d="M -34 0 Q -20 15 0 15 Q 20 15 34 0 Z" fill="#0f2f42" stroke="#7dd3fc" stroke-width="1.6"></path> <!-- mast --> <line x1="-2" y1="0" x2="-2" y2="-44" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"></line> <!-- sail, filled by the wind --> <path d="M -2 -42 Q 22 -28 16 -4 L -2 -4 Z" fill="#1e5068" stroke="#7dd3fc" stroke-width="1.2" opacity="0.9"></path> <!-- tiller: a short bar at the stern, the hand's small correction --> <line x1="-34" y1="2" x2="-52" y2="-4" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"></line> </g> <!-- the guiding star: the cosmic-X, glowing sky-blue, fixed high in the sky --> <g${addAttribute(`translate(${star.x} ${star.y})`, "transform")}> <circle cx="0" cy="0" r="40" fill="url(#starglow)"></circle> <g stroke="url(#starx)" stroke-width="5.5" stroke-linecap="round" transform="translate(-11 -11)"> <line x1="0" y1="0" x2="22" y2="22"></line> <line x1="22" y1="0" x2="0" y2="22"></line> </g> </g> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/TillerArt.astro", void 0);

export { $$TillerArt as $ };
