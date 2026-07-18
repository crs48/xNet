import { c as createAstro, a as createComponent, m as maybeRenderHead, d as renderTemplate, e as renderScript } from './astro/server_CDqOe6mW.mjs';
/* empty css                                */

const $$Astro = createAstro("https://xnet.fyi");
const $$Mermaid = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Mermaid;
  const { code, caption } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<figure class="not-prose my-10"> <div class="overflow-x-auto rounded-2xl border border-border bg-surface/30 p-4 dark:bg-surface/40 lg:p-6"> <pre class="mermaid">${code}</pre> </div> ${caption && renderTemplate`<figcaption class="mt-3 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400"> ${caption} </figcaption>`} </figure>  ${renderScript($$result, "/home/runner/work/xNet/xNet/site/src/components/blog/Mermaid.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/Mermaid.astro", void 0);

export { $$Mermaid as $ };
