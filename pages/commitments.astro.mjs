import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SectionHeader } from '../chunks/SectionHeader_C1QfMrnP.mjs';
import { u as updated, c as commitments, a as charterUrl } from '../chunks/commitments_fGyc8XRW.mjs';
export { renderers } from '../renderers.mjs';

const $$Commitments = createComponent(($$result, $$props, $$slots) => {
  const editUrl = "https://github.com/crs48/xNet/blob/main/site/src/data/commitments.ts";
  const badgeClass = {
    enforced: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    architectural: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    building: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  };
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Our commitments \u2014 the xNet Humane Internet Charter", "description": "Six commitments \u2014 Own, Exit, Calm, Consent, Agency, Commons \u2014 each with a receipt. Software that serves instead of extracts." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="mx-auto max-w-4xl px-6 py-16 sm:py-24"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "Our commitments", "subtitle": "The Humane Internet Charter \u2014 software that serves instead of extracts. Six promises, each with a receipt." })} <p class="mt-6 max-w-2xl text-gray-600 dark:text-gray-400">
A commitment with no receipt is just marketing. Where one is <strong>enforced</strong>, a CI
      gate fails the build if it regresses. Where it is <strong>architectural</strong>, it is a
      property of how the code is built. Where we are still <strong>building</strong>, we say so —
      honesty about the gap is itself a commitment.
</p> <ol class="mt-12 space-y-6"> ${commitments.map((c, i) => renderTemplate`<li${addAttribute(c.name.toLowerCase(), "id")} class="rounded-2xl border border-border bg-surface p-6 sm:p-8"> <div class="flex flex-wrap items-baseline justify-between gap-3"> <h3 class="text-xl font-semibold text-gray-900 dark:text-white"> <span class="mr-2 font-mono text-sm text-gray-400"> ${String(i + 1).padStart(2, "0")} </span> ${c.name} </h3> <span${addAttribute(`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass[c.backing]}`, "class")}> ${c.backingLabel} </span> </div> <p class="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">${c.promise}</p> <p class="mt-2 text-gray-600 dark:text-gray-400">${c.detail}</p> </li>`)} </ol> <div class="mt-12 rounded-2xl border border-border bg-surface p-6 sm:p-8"> <p class="text-gray-600 dark:text-gray-400">
We deliberately avoid the trap of selling rebellion back to you: no “verified” upsell, no
        follower-count vanity, no neo-Luddite skin. The goal is ordinary, well-built, honest
        software — and to prove it.
</p> <div class="mt-5 flex flex-wrap gap-3 text-sm"> <a${addAttribute(charterUrl, "href")} class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-all hover:bg-indigo-500">
Read the full Charter
</a> <a href="/why" class="rounded-lg border border-border px-4 py-2 text-gray-700 transition-all hover:bg-surface dark:text-gray-300">
Why this matters →
</a> </div> <p class="mt-4 text-xs text-gray-400">
Updated ${updated}. Single-sourced from <a class="underline"${addAttribute(editUrl, "href")}>commitments.ts</a>.
</p> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/commitments.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/commitments.astro";
const $$url = "/commitments";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Commitments,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
