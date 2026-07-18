import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { P as PRICING, s as startUrl, O as ONBOARDING_STEPS } from '../chunks/pricing_g8ItZL5s.mjs';
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const whatYouGet = [
    {
      title: "A hub that is yours alone",
      body: "No shared tenancy. We provision a dedicated, isolated hub per account \u2014 encrypted backup, relay, and full-text search, managed and upgraded for you.",
      color: "indigo"
    },
    {
      title: "Local-first, never locked in",
      body: "Your data lives on your devices first and syncs to your hub. Move between self-hosted and managed any time \u2014 the app never calls home to a control plane.",
      color: "emerald"
    },
    {
      title: "You hold the keys",
      body: "Your data identity is a passkey on your device, separate from billing. We hold encrypted bytes we cannot read. Recover your account by email; your data stays yours.",
      color: "purple"
    }
  ];
  const colors = {
    indigo: { border: "border-indigo-500/20", bg: "bg-indigo-500/[0.03]", text: "text-indigo-500 dark:text-indigo-400" },
    emerald: { border: "border-emerald-500/20", bg: "bg-emerald-500/[0.03]", text: "text-emerald-500 dark:text-emerald-400" },
    purple: { border: "border-purple-500/20", bg: "bg-purple-500/[0.03]", text: "text-purple-500 dark:text-purple-400" }
  };
  const featured = PRICING.find((t) => t.featured) ?? PRICING[1];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet Cloud \u2014 A managed hub that is yours alone", "description": "xNet Cloud runs your hub for you: dedicated, isolated, encrypted backup and sync \u2014 local-first and never locked in. Sign in with WorkOS, pick a plan, and connect your app in minutes." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> <!-- Hero --> <section class="relative overflow-hidden border-b border-border/50 py-24 lg:py-32"> <div class="absolute left-1/2 top-0 -translate-x-1/2 h-[420px] w-[680px] rounded-full bg-indigo-500/[0.06] blur-[130px]"></div> <div class="relative mx-auto max-w-4xl px-6 text-center"> <p class="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">xNet Cloud</p> <h1 class="mb-6 text-4xl font-bold text-gray-800 dark:text-white sm:text-5xl lg:text-6xl">
A managed hub that is <span class="text-indigo-500 dark:text-indigo-400">yours alone</span> </h1> <p class="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-500 dark:text-gray-400">
xNet is local-first and self-hostable. xNet Cloud runs your hub for you —
          dedicated, isolated, backed up, and always reachable — so your data syncs
          everywhere without you babysitting a server.
</p> <div class="flex flex-wrap justify-center gap-4"> <a${addAttribute(startUrl("demo"), "href")} class="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Start free
</a> <a href="/cloud/pricing" class="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-300">
See pricing
</a> </div> <p class="mt-4 text-xs text-gray-500">No card for the free tier. Cancel any time.</p> </div> </section> <!-- What you get --> <section class="py-20 lg:py-28"> <div class="mx-auto max-w-6xl px-6"> <h2 class="mb-3 text-center text-2xl font-bold text-gray-800 dark:text-white sm:text-3xl">
What you get
</h2> <p class="mx-auto mb-12 max-w-2xl text-center text-gray-500 dark:text-gray-400">
The convenience of managed hosting, without giving up the things local-first is for.
</p> <div class="grid gap-6 lg:grid-cols-3"> ${whatYouGet.map((f) => {
    const c = colors[f.color];
    return renderTemplate`<div${addAttribute(`rounded-xl border ${c.border} ${c.bg} p-7`, "class")}> <h3${addAttribute(`mb-3 text-lg font-semibold ${c.text}`, "class")}>${f.title}</h3> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${f.body}</p> </div>`;
  })} </div> </div> </section> <!-- How it works --> <section class="border-y border-border/50 bg-surface/10 py-20 dark:bg-surface/20 lg:py-28"> <div class="mx-auto max-w-5xl px-6"> <h2 class="mb-3 text-center text-2xl font-bold text-gray-800 dark:text-white sm:text-3xl">
How onboarding works
</h2> <p class="mx-auto mb-12 max-w-2xl text-center text-gray-500 dark:text-gray-400">
From "never heard of it" to "syncing across all my devices" in four steps.
</p> <ol class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"> ${ONBOARDING_STEPS.map((step) => renderTemplate`<li class="rounded-xl border border-border bg-surface/30 p-6"> <div class="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-bold text-indigo-500 dark:text-indigo-400"> ${step.n} </div> <h3 class="mb-2 text-base font-semibold text-gray-800 dark:text-white">${step.title}</h3> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${step.body}</p> </li>`)} </ol> </div> </section> <!-- Pricing teaser --> <section class="py-20 lg:py-28"> <div class="mx-auto max-w-3xl px-6 text-center"> <h2 class="mb-3 text-2xl font-bold text-gray-800 dark:text-white sm:text-3xl">Simple, honest pricing</h2> <p class="mb-8 text-gray-500 dark:text-gray-400">
Start free, then ${featured.name} from
${typeof featured.price === "object" ? ` $${featured.price.amount}${featured.price.unit}` : ""}.
          Every paid plan is a dedicated hub with managed AI.
</p> <a href="/cloud/pricing" class="inline-block rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Compare plans
</a> </div> </section> <!-- Enterprise --> <section id="enterprise" class="scroll-mt-24 border-t border-border/50 py-20 lg:py-28"> <div class="mx-auto max-w-4xl px-6"> <div class="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] p-8 sm:p-10"> <h2 class="mb-4 text-2xl font-bold text-gray-800 dark:text-white">Enterprise</h2> <p class="mb-6 max-w-2xl leading-relaxed text-gray-500 dark:text-gray-400">
Region-pinned deployments, SSO and SCIM via WorkOS, a custom SLA, audit
            logging, and admin controls. Bring your own identity provider and keep
            your data where your compliance team needs it.
</p> <a href="mailto:hello@xnet.fyi?subject=xNet%20Cloud%20Enterprise" class="inline-block rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-300">
Contact sales
</a> </div> </div> </section> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/cloud/index.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/cloud/index.astro";
const $$url = "/cloud";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
