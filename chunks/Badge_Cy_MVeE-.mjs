import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, r as renderSlot, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$Badge = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Badge;
  const { variant = "default" } = Astro2.props;
  const colors = {
    default: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-300"
  };
  return renderTemplate`${maybeRenderHead()}<span${addAttribute(`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colors[variant]}`, "class")}> ${renderSlot($$result, $$slots["default"])} </span>`;
}, "/home/runner/work/xNet/xNet/site/src/components/ui/Badge.astro", void 0);

export { $$Badge as $ };
