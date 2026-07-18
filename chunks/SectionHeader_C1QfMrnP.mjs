import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$SectionHeader = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SectionHeader;
  const { title, subtitle, align = "left" } = Astro2.props;
  const alignClass = align === "center" ? "text-center" : "";
  return renderTemplate`${maybeRenderHead()}<div${addAttribute(`${alignClass}`, "class")}> <h2 class="text-3xl font-bold tracking-tight sm:text-4xl"> <span class="bg-gradient-to-br from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent"> ${title} </span> </h2> ${subtitle && renderTemplate`<p${addAttribute(`mt-3 text-lg text-gray-500 dark:text-gray-400 ${align === "center" ? "mx-auto max-w-2xl" : "max-w-2xl"}`, "class")}> ${subtitle} </p>`} </div>`;
}, "/home/runner/work/xNet/xNet/site/src/components/ui/SectionHeader.astro", void 0);

export { $$SectionHeader as $ };
