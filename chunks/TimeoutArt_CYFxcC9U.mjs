import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate, f as renderComponent, F as Fragment } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$TimeoutArt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$TimeoutArt;
  const { class: className = "pointer-events-none absolute inset-0 h-full w-full" } = Astro2.props;
  const peers = [
    [520, 150, 5],
    [610, 96, 6],
    [700, 168, 5],
    [788, 84, 6],
    [864, 152, 5],
    [946, 100, 5],
    [716, 52, 4.4]
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [1, 6],
    [2, 3],
    [3, 4],
    [3, 6],
    [4, 5],
    [2, 4]
  ];
  const chest = [214, 224];
  const cables = [
    { to: [520, 150], state: "lit" },
    { to: [610, 96], state: "lit" },
    { to: [700, 168], state: "dim" },
    { to: [788, 84], state: "dashed" }
  ];
  const cablePath = ([x2, y2]) => {
    const [x1, y1] = chest;
    const mx = (x1 + x2) / 2;
    const my = Math.max(y1, y2) + 42;
    return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  };
  return renderTemplate`${maybeRenderHead()}<svg${addAttribute(className, "class")} viewBox="0 0 1040 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="tobg" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#0a1122"></stop> <stop offset="55%" stop-color="#0d1526"></stop> <stop offset="100%" stop-color="#080d1a"></stop> </linearGradient> <radialGradient id="tolampglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.95"></stop> <stop offset="45%" stop-color="#38bdf8" stop-opacity="0.38"></stop> <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"></stop> </radialGradient> <linearGradient id="tolampx" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#e0f2fe"></stop> <stop offset="100%" stop-color="#38bdf8"></stop> </linearGradient> <radialGradient id="tochestglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.8"></stop> <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"></stop> </radialGradient> </defs> <rect width="1040" height="340" fill="url(#tobg)"></rect> <!-- ── the cosmic-X reading lamp, top-right corner of the sky ─────────── --> <circle cx="984" cy="44" r="52" fill="url(#tolampglow)"></circle> <g stroke="url(#tolampx)" stroke-width="6.4" stroke-linecap="round"> <line x1="969" y1="29" x2="999" y2="59"></line> <line x1="999" y1="29" x2="969" y2="59"></line> </g> <!-- ── upper right: the dreamed mesh — peers among peers, no centre ───── --> <g stroke="#38bdf8" stroke-opacity="0.28" stroke-width="1.4"> ${edges.map(([a, b]) => renderTemplate`<line${addAttribute(peers[a][0], "x1")}${addAttribute(peers[a][1], "y1")}${addAttribute(peers[b][0], "x2")}${addAttribute(peers[b][1], "y2")}></line>`)} </g> ${peers.map(([x, y, r]) => renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <circle${addAttribute(x, "cx")}${addAttribute(y, "cy")}${addAttribute(r + 5, "r")} fill="none" stroke="#38bdf8" stroke-opacity="0.25" stroke-width="1.2"></circle> <circle${addAttribute(x, "cx")}${addAttribute(y, "cy")}${addAttribute(r, "r")} fill="#7dd3fc" opacity="0.65"></circle> ` })}`)} <!-- the paused clock hanging in the mesh: stopped, not broken --> <g> <line x1="716" y1="52" x2="716" y2="20" stroke="#2b3b5e" stroke-width="1.6"></line> <circle cx="740" cy="118" r="17" fill="#0d1729" stroke="#466195" stroke-width="2"></circle> <g stroke="#7dd3fc" stroke-opacity="0.85" stroke-width="3" stroke-linecap="round"> <line x1="735" y1="112" x2="735" y2="124"></line> <line x1="745" y1="112" x2="745" y2="124"></line> </g> </g> <!-- ── the cables, plugged back in one at a time ──────────────────────── --> ${cables.map(({ to, state }) => renderTemplate`<path${addAttribute(cablePath(to), "d")} fill="none"${addAttribute(state === "lit" ? "#7dd3fc" : "#38bdf8", "stroke")}${addAttribute(state === "lit" ? 0.6 : state === "dim" ? 0.3 : 0.22, "stroke-opacity")}${addAttribute(state === "lit" ? 2.2 : 1.6, "stroke-width")}${addAttribute(state === "dashed" ? "3 9" : void 0, "stroke-dasharray")} stroke-linecap="round"></path>`)} <!-- ── bottom left: the recliner, and the peer that went quiet ────────── --> <!-- soft glow rising off the chest node --> <circle${addAttribute(chest[0], "cx")}${addAttribute(chest[1], "cy")} r="46" fill="url(#tochestglow)"></circle> <g stroke="#466195" stroke-width="4" stroke-linecap="round" fill="none"> <!-- reclined backrest --> <path d="M 108 168 L 156 236"></path> <!-- seat running forward --> <path d="M 156 236 L 260 250"></path> <!-- raised leg rest --> <path d="M 260 250 L 316 234"></path> <!-- chair base and feet --> <path d="M 150 250 L 150 290"></path> <path d="M 282 262 L 282 290"></path> <path d="M 128 290 L 306 290"></path> </g> <!-- the resting figure: head back, body along the recline --> <circle cx="128" cy="164" r="17" fill="#101a2f" stroke="#7dd3fc" stroke-opacity="0.75" stroke-width="2.4"></circle> <path d="M 140 178 Q 196 214 258 236 Q 288 244 308 232" fill="none" stroke="#7dd3fc" stroke-opacity="0.75" stroke-width="3.2" stroke-linecap="round"></path> <!-- the chest node: still lit the whole time --> <circle${addAttribute(chest[0], "cx")}${addAttribute(chest[1], "cy")} r="6.4" fill="#7dd3fc"></circle> <circle${addAttribute(chest[0], "cx")}${addAttribute(chest[1], "cy")} r="12" fill="none" stroke="#38bdf8" stroke-opacity="0.5" stroke-width="1.4"></circle> <circle${addAttribute(chest[0], "cx")}${addAttribute(chest[1], "cy")} r="19" fill="none" stroke="#38bdf8" stroke-opacity="0.22" stroke-width="1.2"></circle> <!-- ground shadow --> <ellipse cx="214" cy="300" rx="130" ry="9" fill="#060b16"></ellipse> </svg>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/TimeoutArt.astro", void 0);

export { $$TimeoutArt as $ };
