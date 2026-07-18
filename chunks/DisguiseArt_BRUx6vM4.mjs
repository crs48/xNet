import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$DisguiseArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$DisguiseArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const staffYs = [196, 212, 228, 244, 260];
  const monolith = { x: 660, y: 56, w: 190, h: 250 };
  const notes = [
    [104, 212, 0.9],
    [168, 244, 0.75],
    [232, 228, 0.9],
    [300, 196, 0.8],
    [368, 260, 0.7],
    [432, 228, 0.9],
    [500, 212, 0.8],
    [568, 244, 0.85],
    [624, 228, 0.75]
  ];
  const inside = [
    [700, 212, 0.3],
    [738, 244, 0.24],
    [776, 196, 0.28],
    [812, 260, 0.22],
    [752, 148, 0.2],
    [790, 116, 0.16]
  ];
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="dbg" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#100c1d"></stop> <stop offset="55%" stop-color="#0c0917"></stop> <stop offset="100%" stop-color="#080611"></stop> </linearGradient> <linearGradient id="dbox" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#1a1430"></stop> <stop offset="100%" stop-color="#120d22"></stop> </linearGradient> <radialGradient id="dglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.85"></stop> <stop offset="45%" stop-color="#f59e0b" stop-opacity="0.3"></stop> <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"></stop> </radialGradient> <linearGradient id="dx" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#fde68a"></stop> <stop offset="100%" stop-color="#f59e0b"></stop> </linearGradient> <!-- one small person: head + shoulders, used for every note --> <g id="dfig"> <circle cx="0" cy="-14" r="4.6"></circle> <path d="M -6 0 Q -6 -9 0 -9 Q 6 -9 6 0 Z"></path> </g> </defs> <rect width="1040" height="340" fill="url(#dbg)"></rect> <!-- the staff: the protocol everything has to fit through --> <g stroke="#332a52" stroke-width="1.4" opacity="0.75"> ${staffYs.map((y) => renderTemplate`<line x1="0"${addAttribute(y, "y1")}${addAttribute(monolith.x, "x2")}${addAttribute(y, "y2")}></line>`)} </g> <!-- the staff continues inside the box, fainter: same lines, same people --> <g stroke="#332a52" stroke-width="1.2" opacity="0.3"> ${staffYs.map((y) => renderTemplate`<line${addAttribute(monolith.x, "x1")}${addAttribute(y, "y1")}${addAttribute(monolith.x + monolith.w, "x2")}${addAttribute(y, "y2")}></line>`)} </g> <!-- note-heads that are people, walking the staff toward the box --> <g fill="#a78bfa"> ${notes.map(([x, y, o]) => renderTemplate`<use href="#dfig"${addAttribute(`translate(${x} ${y})`, "transform")}${addAttribute(o, "opacity")}></use>`)} </g> <!-- the black box --> <rect${addAttribute(monolith.x, "x")}${addAttribute(monolith.y, "y")}${addAttribute(monolith.w, "width")}${addAttribute(monolith.h, "height")} rx="10" fill="url(#dbox)" stroke="#3b3160" stroke-width="1.6" opacity="0.96"></rect> <!-- inside the box: the same figures, still there, in disguise --> <g fill="#a78bfa"> ${inside.map(([x, y, o]) => renderTemplate`<use href="#dfig"${addAttribute(`translate(${x} ${y})`, "transform")}${addAttribute(o, "opacity")}></use>`)} </g> <!-- the seam of light: the cosmic-X where the box opens --> <g${addAttribute(`translate(${monolith.x + monolith.w / 2} ${monolith.y + 62})`, "transform")}> <circle cx="0" cy="0" r="44" fill="url(#dglow)"></circle> <g stroke="url(#dx)" stroke-width="5.5" stroke-linecap="round" transform="translate(-11 -12)"> <line x1="0" y1="0" x2="22" y2="24"></line> <line x1="22" y1="0" x2="0" y2="24"></line> </g> </g> <!-- MIDI, faint, under everything: the keyboard the lock-in came from --> <g opacity="0.35"> <line x1="0" y1="300" x2="1040" y2="300" stroke="#332a52" stroke-width="1"></line> ${Array.from({ length: 26 }, (_, i) => renderTemplate`<rect${addAttribute(i * 40, "x")} y="300" width="39" height="40" fill="none" stroke="#241d3e" stroke-width="1"></rect>`)} ${Array.from(
    { length: 26 },
    (_, i) => [1, 2, 4, 5, 6].includes(i % 7) ? renderTemplate`<rect${addAttribute(i * 40 - 8, "x")} y="300" width="16" height="24" fill="#241d3e"></rect>` : null
  )} </g> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/DisguiseArt.astro", void 0);

export { $$DisguiseArt as $ };
