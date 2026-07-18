import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
export { renderers } from '../renderers.mjs';

const $$Subprocessors = createComponent(($$result, $$props, $$slots) => {
  const updated = "June 24, 2026";
  const subprocessors = [
    {
      name: "WorkOS",
      url: "https://workos.com/",
      purpose: "Accounts, authentication, SSO/SCIM",
      data: "Email, name, account identifier",
      region: "United States"
    },
    {
      name: "Stripe",
      url: "https://stripe.com/",
      purpose: "Payments and AI usage metering",
      data: "Email, customer reference, plan, charge amounts",
      region: "United States"
    },
    {
      name: "Google Cloud (Cloud Run, Firestore)",
      url: "https://cloud.google.com/",
      purpose: "Hub compute and control-plane state",
      data: "Tenant metadata, AI usage totals, your running hub",
      region: "Per plan; region-pinned for Enterprise"
    },
    {
      name: "Cloudflare R2",
      url: "https://www.cloudflare.com/developer-platform/r2/",
      purpose: "Encrypted content blobs and database backups",
      data: "Encrypted tenant content, database snapshots",
      region: "Cloudflare network"
    },
    {
      name: "OpenRouter",
      url: "https://openrouter.ai/",
      purpose: "Managed AI gateway (opt-in feature)",
      data: "Prompt and message content you send to the AI",
      region: "United States / selected model provider"
    },
    {
      name: "Plausible Analytics",
      url: "https://plausible.io/",
      purpose: "Cookieless website analytics",
      data: "Page views, country, device type (no personal data)",
      region: "European Union"
    }
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Sub-processors - xNet", "description": "The third parties that process data on behalf of xNet Cloud." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="min-h-screen bg-white dark:bg-gray-900"> <div class="mx-auto max-w-4xl px-6 py-16 lg:py-24"> <header class="mb-10"> <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">Sub-processors</h1> <p class="text-lg text-gray-600 dark:text-gray-300">
Who helps us run xNet Cloud, what they receive, and where they operate.
</p> <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">Last updated: ${updated}</p> </header> <div class="prose prose-gray dark:prose-invert max-w-none prose-a:text-blue-600 dark:prose-a:text-blue-400"> <p>
These third parties process data on our behalf to provide <a href="/cloud">xNet Cloud</a>, our
          managed, paid service. <strong>The local-first app and self-hosted hubs use none of them.</strong>
Services you choose to connect yourself (such as GitHub, Notion, Slack, or your own webhooks) are
          your integrations, not our sub-processors, and their own terms govern.
</p> </div> <div class="mt-8 overflow-x-auto"> <table class="w-full border-collapse text-left text-sm"> <thead> <tr class="border-b border-gray-200 dark:border-gray-700"> <th class="py-3 pr-4 font-semibold text-gray-700 dark:text-gray-200">Provider</th> <th class="py-3 pr-4 font-semibold text-gray-700 dark:text-gray-200">Purpose</th> <th class="py-3 pr-4 font-semibold text-gray-700 dark:text-gray-200">Data processed</th> <th class="py-3 font-semibold text-gray-700 dark:text-gray-200">Location</th> </tr> </thead> <tbody> ${subprocessors.map((s) => renderTemplate`<tr class="border-b border-gray-100 dark:border-gray-800 align-top"> <td class="py-3 pr-4 font-medium text-gray-800 dark:text-gray-100"> <a${addAttribute(s.url, "href")} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline dark:text-blue-400"> ${s.name} </a> </td> <td class="py-3 pr-4 text-gray-600 dark:text-gray-300">${s.purpose}</td> <td class="py-3 pr-4 text-gray-600 dark:text-gray-300">${s.data}</td> <td class="py-3 text-gray-600 dark:text-gray-300">${s.region}</td> </tr>`)} </tbody> </table> </div> <div class="prose prose-gray dark:prose-invert max-w-none mt-10 prose-a:text-blue-600 dark:prose-a:text-blue-400"> <h2>Changes to this list</h2> <p>
We update this page when we add, remove, or change a sub-processor and bump the date above.
          Business customers under our <a href="/dpa">Data Processing Addendum</a> receive advance notice of
          new sub-processors and may object as described there. For questions, contact
<a href="mailto:privacy@xnet.fyi">privacy@xnet.fyi</a>.
</p> <p class="text-sm text-gray-500 dark:text-gray-400">
See also our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.
</p> </div> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/subprocessors.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/subprocessors.astro";
const $$url = "/subprocessors";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Subprocessors,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
