import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
export { renderers } from '../renderers.mjs';

const $$Terms = createComponent(($$result, $$props, $$slots) => {
  const updated = "June 24, 2026";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Terms of Service - xNet", "description": "The terms for using xNet \u2014 the open-source local-first app and the xNet Cloud managed service." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="min-h-screen bg-white dark:bg-gray-900"> <div class="mx-auto max-w-3xl px-6 py-16 lg:py-24"> <!-- Header --> <header class="mb-12"> <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
Terms of Service
</h1> <p class="text-lg text-gray-600 dark:text-gray-300">
Simple terms for a simple promise: your data is yours.
</p> <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
Last updated: ${updated} </p> </header> <!-- Content --> <article class="prose prose-gray dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-blue-600 dark:prose-a:text-blue-400"> <section class="mb-12"> <h2>The Basics</h2> <p>
xNet is open source software for building local-first applications. When we say "xNet," "we," or "us,"
            we mean the xNet project and its maintainers. When we say "Services," we mean:
</p> <ul> <li>The xNet desktop application</li> <li>The xNet web application at xnet.fyi/app</li> <li>The shared hosted Hub at hub.xnet.fyi</li> <li><strong>xNet Cloud</strong> — our managed, paid service that provisions and runs a dedicated Hub for you, including its dashboard at cloud.xnet.fyi</li> <li>The <strong>plugin marketplace</strong> and our documentation and website</li> </ul> <p>
By using xNet, you agree to these terms. We keep them simple because we believe in transparency.
            Some Services have additional terms referenced here — the <a href="/acceptable-use">Acceptable Use Policy</a>,
            the <a href="/marketplace-terms">Marketplace Terms</a>, and, for business customers, our
<a href="/dpa">Data Processing Addendum</a> — which form part of these terms when they apply to you.
</p> </section> <section class="mb-12"> <h2>Your Data, Your Responsibility</h2> <p>
xNet is local-first software. By default, your data lives on your devices, not our servers. This means:
</p> <ul> <li><strong>You own your data</strong> — We make no claim to anything you create</li> <li><strong>You're responsible for backups</strong> — On the local-first path, if you lose your device, we can't recover your data. (xNet Cloud adds managed backups — see below.)</li> <li><strong>You control sharing</strong> — Data only syncs with devices and people you choose</li> </ul> <p>
We provide tools to export your data at any time. Your content remains yours if you stop using xNet.
</p> </section> <section class="mb-12"> <h2>Accounts and xNet Cloud</h2> <p>
You can use the local-first app without an account. <a href="/cloud">xNet Cloud</a> is optional and
            requires an account, created through <a href="https://workos.com/">WorkOS</a>. When you use xNet Cloud:
</p> <ul> <li>You must provide accurate account information and keep your credentials secure. You're responsible for activity under your account.</li> <li>You must be old enough to form a binding contract and to consent to data processing in your jurisdiction (see our <a href="/privacy">Privacy Policy</a> on children's privacy).</li> <li>We provision a dedicated Hub for you and store your encrypted content and backups with our infrastructure providers (see the <a href="/subprocessors">sub-processor list</a>).</li> </ul> </section> <section class="mb-12"> <h2>Plans, Billing, and Cancellation</h2> <p>
xNet Cloud is offered on the plans shown on our <a href="/cloud/pricing">pricing page</a>
(currently a free shared tier plus Personal, Family, Team, and Enterprise). Payments are
            processed by <a href="https://stripe.com/">Stripe</a>. By subscribing:
</p> <ul> <li>You authorize recurring charges for your plan until you cancel. Prices may change with notice; changes apply to the next billing period.</li> <li><strong>Usage-based charges:</strong> some features (such as managed AI beyond your included budget) are metered and shown on your dashboard. A hard budget stop helps prevent surprise bills.</li> <li><strong>Cancellation:</strong> you can cancel any time. Your subscription ends at the close of the current period and your Hub is suspended, with your encrypted backup retained for a grace window so you can re-subscribe or export. Deleting your data is a separate, explicit, irreversible action.</li> <li><strong>Refunds:</strong> except where required by law, fees are non-refundable. Annual plans are billed up front.</li> <li><strong>Taxes:</strong> prices exclude taxes unless stated; you're responsible for applicable taxes.</li> </ul> </section> <section class="mb-12"> <h2>Managed AI</h2> <p>
Paid plans include a managed AI gateway, which is off until you use it. When you use it, your
            messages are sent to our gateway provider and the model provider you select, as described in our
<a href="/privacy">Privacy Policy</a>. You're responsible for your inputs and for your use of AI
            outputs, which may be inaccurate. Don't use managed AI for prohibited content (see the
<a href="/acceptable-use">Acceptable Use Policy</a>), and note that the AI providers' own terms
            apply to content you send through the gateway.
</p> </section> <section class="mb-12"> <h2>The Plugin Marketplace</h2> <p>
xNet supports plugins, including third-party and paid plugins distributed through our
<a href="/plugins">marketplace</a>. Community plugins are provided by their authors, not by xNet.
            Installing one means granting it the capabilities it requests. Your use of marketplace plugins,
            and the terms for authors who publish them, are governed by the
<a href="/marketplace-terms">Marketplace Terms</a>. xNet does not warrant third-party plugins
            and is not liable for them.
</p> </section> <section class="mb-12"> <h2>Acceptable Use</h2> <p>
We built xNet to help people work and create. Don't use the Services to:
</p> <ul> <li>Break the law or help others break the law</li> <li>Harass, abuse, or harm others</li> <li>Distribute malware or spam</li> <li>Attempt to breach security of the Services or other users</li> <li>Overwhelm our infrastructure with automated requests</li> <li>Impersonate others or misrepresent your affiliation</li> </ul> <p>
Our full <a href="/acceptable-use">Acceptable Use Policy</a> has the details and explains
            enforcement and appeals. We reserve the right to suspend access to hosted Services for
            violations. Since the core application runs locally, we can't stop you from using the software
            itself — that's a feature, not a bug.
</p> </section> <section class="mb-12"> <h2>The Hosted Hub</h2> <p>
Our shared hosted Hub at hub.xnet.fyi is a convenience service for peer-to-peer sync. It and the
            free Cloud tier are provided as-is:
</p> <ul> <li>We aim for high availability but don't guarantee uptime on free/shared tiers</li> <li>We may need to perform maintenance with limited notice</li> <li>We may rate-limit connections to ensure fair usage</li> <li>We reserve the right to block abusive connections</li> </ul> <p>
Paid xNet Cloud plans target higher availability as described on the pricing page; any service-level
            commitments and credits, if offered, are stated in your plan or order. For mission-critical use you
            can always <a href="/docs/guides/hub/">self-host your own Hub</a>.
</p> </section> <section class="mb-12"> <h2>Open Source License</h2> <p>
xNet is released under the <a href="https://github.com/crs48/xNet/blob/main/LICENSE">MIT License</a>. This means:
</p> <ul> <li>You can use, copy, modify, and distribute the software</li> <li>You can use it for commercial purposes</li> <li>You must include the original copyright notice</li> <li>The software is provided "as is" without warranty</li> </ul> <p>
Our documentation, branding, the xNet Cloud managed service, and the marketplace have separate
            terms outlined here and in the documents referenced above.
</p> </section> <section class="mb-12"> <h2>Intellectual Property</h2> <p>
The xNet name, logo, and branding are ours. The source code is MIT licensed (see above).
            Content you create in xNet belongs to you.
</p> <p>
Don't use our branding in ways that suggest we endorse or are affiliated with your project
            without permission. Using xNet as part of your product name is fine
            (like "Powered by xNet" or "Built with xNet").
</p> </section> <section class="mb-12"> <h2>No Warranty</h2> <p>
xNet is provided "as is" without warranty of any kind. We work hard to make it reliable,
            but we can't guarantee it will be:
</p> <ul> <li>Error-free or uninterrupted</li> <li>Secure against all threats</li> <li>Compatible with all systems</li> <li>Suitable for any particular purpose</li> </ul> <p>
Use xNet at your own risk. For important data, keep backups. Third-party plugins, integrations,
            and AI providers are not warranted by us.
</p> </section> <section class="mb-12"> <h2>Limitation of Liability</h2> <p>
To the maximum extent permitted by law, we are not liable for any indirect, incidental,
            special, consequential, or punitive damages, including:
</p> <ul> <li>Loss of data or content</li> <li>Loss of profits or revenue</li> <li>Business interruption</li> <li>Cost of substitute services</li> <li>Acts or omissions of third-party plugins, integrations, or AI providers</li> </ul> <p>
This applies whether the claim is based on warranty, contract, tort, or any other legal theory.
            Some jurisdictions don't allow these limitations, so they may not apply to you.
</p> </section> <section class="mb-12"> <h2>Changes to These Terms</h2> <p>
We may update these terms occasionally. When we do:
</p> <ul> <li>We'll update the date at the top of this page</li> <li>For significant changes, we'll provide notice on our website, and where appropriate notify account holders by email</li> <li>Continued use of the Services means you accept the new terms</li> </ul> <p>
You can track all changes in our <a href="https://github.com/crs48/xNet">GitHub repository</a>.
</p> </section> <section class="mb-12"> <h2>Termination</h2> <p>
You can stop using xNet at any time. Just delete the app or stop visiting our services, and
            cancel any xNet Cloud subscription from your dashboard.
</p> <p>
We can suspend or terminate your access to hosted services if you violate these terms.
            We'll try to give notice when possible, but may act immediately for serious violations.
</p> <p>
Since xNet is local-first, termination from hosted services doesn't affect your local data
            or your ability to self-host.
</p> </section> <section class="mb-12"> <h2>Governing Law</h2> <p>
These terms are governed by the laws of the jurisdiction where the project maintainers are located,
            without regard to conflict of law principles. Any disputes will be resolved in that jurisdiction's courts.
</p> </section> <section class="mb-12"> <h2>Contact</h2> <p>
Questions about these terms? Reach out:
</p> <ul> <li>Email: <a href="mailto:legal@xnet.fyi">legal@xnet.fyi</a></li> <li>GitHub: <a href="https://github.com/crs48/xNet/issues">Open an issue</a></li> </ul> </section> <section class="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700"> <p class="text-sm text-gray-500 dark:text-gray-400">
These terms are adapted from the
<a href="https://github.com/basecamp/policies" class="text-gray-600 dark:text-gray-300 underline">Basecamp open-source policies</a>
/ <a href="https://creativecommons.org/licenses/by/4.0/" class="text-gray-600 dark:text-gray-300 underline">CC BY 4.0</a> </p> </section> </article> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/terms.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/terms.astro";
const $$url = "/terms";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Terms,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
