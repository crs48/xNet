import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { u as updated, P as PRICING, F as FAQS } from '../../chunks/pricing_g8ItZL5s.mjs';
export { renderers } from '../../renderers.mjs';

const $$Pricing = createComponent(($$result, $$props, $$slots) => {
  const editUrl = "https://github.com/crs48/xNet/blob/main/site/src/data/pricing.ts";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet Cloud Pricing \u2014 Start free, scale to a dedicated hub", "description": "xNet Cloud pricing: a free shared tier, Personal from $5/mo, Family, Team per-seat, and Enterprise with SSO and data residency. Every paid plan is a dedicated, isolated hub." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="py-24 lg:py-32"> <div class="mx-auto max-w-7xl px-6"> <!-- Hero --> <div class="mb-14 text-center"> <h1 class="mb-6 text-4xl font-bold text-gray-800 dark:text-white sm:text-5xl">Pricing</h1> <p class="mx-auto max-w-2xl text-lg leading-relaxed text-gray-500 dark:text-gray-400">
Start free on a shared hub. Upgrade to a dedicated hub when you want it always
          on. Your data moves with you — and you can self-host at any time.
</p> </div> <!-- Tier grid --> <div class="grid gap-6 lg:grid-cols-5 sm:grid-cols-2"> ${PRICING.map((tier) => renderTemplate`<div${addAttribute(`flex flex-col rounded-2xl border p-6 ${tier.featured ? "border-indigo-500/50 bg-indigo-500/[0.04] ring-1 ring-indigo-500/30" : "border-border bg-surface/30"}`, "class")}> ${tier.featured && renderTemplate`<span class="mb-3 inline-block self-start rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
Most popular
</span>`} <h2 class="text-lg font-bold text-gray-800 dark:text-white">${tier.name}</h2> <p class="mt-1 min-h-[2.5rem] text-sm text-gray-500 dark:text-gray-400">${tier.tagline}</p> <div class="mt-4 min-h-[3.5rem]"> ${tier.price === "free" && renderTemplate`<div class="text-3xl font-bold text-gray-800 dark:text-white">Free</div>`} ${tier.price === "custom" && renderTemplate`<div class="text-3xl font-bold text-gray-800 dark:text-white">Custom</div>`} ${typeof tier.price === "object" && renderTemplate`<div> <span class="text-3xl font-bold text-gray-800 dark:text-white">$${tier.price.amount}</span> <span class="text-sm text-gray-500 dark:text-gray-400">${tier.price.unit}</span> ${tier.price.sub && renderTemplate`<div class="mt-0.5 text-xs text-gray-500">${tier.price.sub}</div>`} </div>`} </div> <a${addAttribute(tier.cta.href, "href")}${addAttribute(`mt-5 block rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors ${tier.featured ? "bg-indigo-600 text-white hover:bg-indigo-500" : "border border-indigo-500/40 text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300"}`, "class")}> ${tier.cta.label} </a> <dl class="mt-6 space-y-2 border-t border-border/60 pt-5 text-sm"> <div class="flex justify-between gap-2"> <dt class="text-gray-500">Storage</dt> <dd class="text-right font-medium text-gray-700 dark:text-gray-200">${tier.storage}</dd> </div> <div class="flex justify-between gap-2"> <dt class="text-gray-500">Seats</dt> <dd class="text-right font-medium text-gray-700 dark:text-gray-200">${tier.seats}</dd> </div> <div class="flex justify-between gap-2"> <dt class="text-gray-500">Isolation</dt> <dd class="text-right font-medium text-gray-700 dark:text-gray-200">${tier.isolation}</dd> </div> </dl> <ul class="mt-5 space-y-2 text-sm text-gray-500 dark:text-gray-400"> ${tier.highlights.map((h) => renderTemplate`<li class="flex items-start gap-2"> <svg class="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"> <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path> </svg> <span>${h}</span> </li>`)} </ul> </div>`)} </div> <p class="mt-6 text-center text-xs text-gray-500">
Also available on request: <strong class="text-gray-600 dark:text-gray-300">Community</strong> and
<strong class="text-gray-600 dark:text-gray-300">Company</strong> tiers with larger quotas and
        project-grade isolation. Prices last updated ${updated}.
<a${addAttribute(editUrl, "href")} target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline">See the data</a>.
</p> <!-- FAQ --> <section id="faq" class="mx-auto mt-24 max-w-3xl scroll-mt-24"> <h2 class="mb-8 text-center text-2xl font-bold text-gray-800 dark:text-white">Questions</h2> <dl class="space-y-4"> ${FAQS.map((faq) => renderTemplate`<div class="rounded-xl border border-border bg-surface/30 p-5"> <dt class="font-semibold text-gray-700 dark:text-gray-200">${faq.q}</dt> <dd class="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">${faq.a}</dd> </div>`)} </dl> </section> <!-- CTA --> <div class="mx-auto mt-16 flex max-w-3xl justify-center gap-4"> <a href="/cloud" class="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-300">
How it works
</a> <a href="/app" class="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Open the app
</a> </div> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/cloud/pricing.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/cloud/pricing.astro";
const $$url = "/cloud/pricing";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Pricing,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
