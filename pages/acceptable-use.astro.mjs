import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
export { renderers } from '../renderers.mjs';

const $$AcceptableUse = createComponent(($$result, $$props, $$slots) => {
  const updated = "June 24, 2026";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Acceptable Use Policy - xNet", "description": "What's allowed on xNet's hosted services, how we enforce it, and how to appeal." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="min-h-screen bg-white dark:bg-gray-900"> <div class="mx-auto max-w-3xl px-6 py-16 lg:py-24"> <header class="mb-12"> <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">Acceptable Use Policy</h1> <p class="text-lg text-gray-600 dark:text-gray-300">
The few rules that keep the shared parts of xNet safe for everyone.
</p> <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">Last updated: ${updated}</p> </header> <article class="prose prose-gray dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-blue-600 dark:prose-a:text-blue-400"> <section class="mb-12"> <h2>Who this applies to</h2> <p>
This policy applies to your use of xNet's <strong>hosted services</strong> — the shared Hub,
            xNet Cloud, the managed AI gateway, and the plugin marketplace. It is part of our
<a href="/terms">Terms of Service</a>. Because xNet is local-first and open source, the software
            you run yourself on your own device or your own Hub is yours to operate — this policy governs the
            services <em>we</em> run.
</p> </section> <section class="mb-12"> <h2>Don't use the hosted services to</h2> <ul> <li>Break the law, or help others break the law</li> <li>Harass, threaten, abuse, or harm others</li> <li>Distribute malware, phishing, or spam</li> <li>Share or generate child sexual abuse material, or sexual content involving minors</li> <li>Incite violence or promote terrorism</li> <li>Attempt to breach the security of the services or other users, or evade abuse controls</li> <li>Overwhelm our infrastructure with automated or high-volume requests</li> <li>Impersonate others or misrepresent your affiliation</li> <li>Infringe others' intellectual property or privacy rights</li> <li>Use the managed AI gateway to produce prohibited content, or to violate the AI providers' own usage policies</li> </ul> </section> <section class="mb-12"> <h2>Fair use and automation</h2> <p>
Hosted Hubs apply rate limits and abuse protections to keep things fair. Don't try to
            circumvent them. Programmatic and agent-driven use is welcome within those limits and within
            this policy.
</p> </section> <section class="mb-12"> <h2>How we enforce this</h2> <p>
We aim to be measured and transparent. Depending on severity, a hub operator (us, for xNet Cloud)
            may:
</p> <ul> <li><strong>Reject</strong> a specific operation or request</li> <li><strong>Hide</strong> or <strong>quarantine</strong> content pending review</li> <li><strong>Rate-limit</strong> or temporarily restrict an identity or connection</li> <li><strong>Block</strong> an abusive peer, and in serious cases <strong>suspend or terminate</strong> hosted access</li> </ul> <p>
Enforcement actions are scoped (to a user, workspace, community, or the whole hub) and may be
            temporary or, for serious violations, permanent. We will try to give notice when possible, but
            may act immediately for serious or ongoing harm. Any automated abuse classification runs under
            privacy controls — by default it uses only metadata or redacted content, not your full documents.
</p> <p>
Because xNet is local-first, enforcement on hosted services never reaches your local data or your
            ability to self-host.
</p> </section> <section class="mb-12"> <h2>Appeals</h2> <p>
If you believe an enforcement action was a mistake, you can appeal. Contact
<a href="mailto:abuse@xnet.fyi">abuse@xnet.fyi</a> with the details and we'll review it. We aim
            to respond within a reasonable time and to restore access promptly where an action was in error.
</p> </section> <section class="mb-12"> <h2>Reporting abuse</h2> <p>
To report content or behavior that violates this policy on our hosted services, email
<a href="mailto:abuse@xnet.fyi">abuse@xnet.fyi</a>. For security vulnerabilities, please email
<a href="mailto:security@xnet.fyi">security@xnet.fyi</a> rather than opening a public issue.
</p> </section> <section class="mb-12"> <h2>Changes</h2> <p>
We may update this policy as the services evolve. We'll update the date above and, for
            significant changes, post a notice. See also our <a href="/terms">Terms of Service</a> and
<a href="/privacy">Privacy Policy</a>.
</p> </section> </article> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/acceptable-use.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/acceptable-use.astro";
const $$url = "/acceptable-use";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$AcceptableUse,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
