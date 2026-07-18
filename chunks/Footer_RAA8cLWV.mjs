import { c as createAstro, a as createComponent, d as renderTemplate, e as renderScript, r as renderSlot, k as renderHead, b as addAttribute, m as maybeRenderHead, f as renderComponent } from './astro/server_CDqOe6mW.mjs';
/* empty css                                  */

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _b;
const $$Astro = createAstro("https://xnet.fyi");
const $$Base = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Base;
  const { title, description } = Astro2.props;
  const analyticsDomain = "";
  return renderTemplate(_b || (_b = __template(['<html lang="en" class="dark scroll-smooth astro-5hce7sga"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description"', '><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>', "</title><!-- Inline script to prevent flash: read localStorage, fallback to system preference --><script>\n      (function() {\n        var storedTheme = localStorage.getItem('xnet-lp-theme')\n        var theme = storedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')\n        if (theme === 'light') {\n          document.documentElement.classList.remove('dark')\n        }\n      })()\n    </script>", "", '</head> <body class="bg-white dark:bg-[#0a0a0f] text-gray-800 dark:text-gray-200 antialiased font-sans leading-relaxed astro-5hce7sga"> ', " ", " </body> </html>"])), addAttribute(description, "content"), title, analyticsDomain, renderHead(), renderSlot($$result, $$slots["default"]), renderScript($$result, "/home/runner/work/xNet/xNet/site/src/layouts/Base.astro?astro&type=script&index=0&lang.ts"));
}, "/home/runner/work/xNet/xNet/site/src/layouts/Base.astro", void 0);

const $$ThemeToggle = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<button id="lp-theme-toggle" class="rounded-lg border border-border p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 transition-colors" aria-label="Toggle theme"> <!-- Sun icon (shown in dark mode) --> <svg class="h-4 w-4 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path> </svg> <!-- Moon icon (shown in light mode) --> <svg class="h-4 w-4 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path> </svg> </button> ${renderScript($$result, "/home/runner/work/xNet/xNet/site/src/components/ui/ThemeToggle.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/runner/work/xNet/xNet/site/src/components/ui/ThemeToggle.astro", void 0);

const $$Nav = createComponent(($$result, $$props, $$slots) => {
  const homeLinks = [
    { href: "/#app", label: "App" },
    { href: "/#hubs", label: "Teams" },
    { href: "/#vision", label: "Vision" }
  ];
  const pageLinks = [
    { href: "/why", label: "Why" },
    { href: "/build-with", label: "Build" },
    { href: "/demos/", label: "Demos" },
    { href: "/blog", label: "Blog" }
  ];
  return renderTemplate`${maybeRenderHead()}<header class="sticky top-0 z-50 border-b border-border/50 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl"> <nav class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"> <a href="/" class="font-mono text-xl font-bold tracking-tight text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
xNet
</a> <div class="flex items-center gap-5 text-sm"> ${homeLinks.map((link) => renderTemplate`<a${addAttribute(link.href, "href")} class="hidden sm:inline text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"> ${link.label} </a>`)} <span class="hidden sm:inline h-4 w-px bg-border" aria-hidden="true"></span> ${pageLinks.map((link) => renderTemplate`<a${addAttribute(link.href, "href")} class="hidden sm:inline text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"> ${link.label} </a>`)} <a href="/docs/introduction/" class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:border-indigo-500/50 hover:bg-surface transition-all"> <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"> <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"></path> </svg>
Docs
</a> <a href="/app" class="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-all">
Try the App
</a> ${renderComponent($$result, "ThemeToggle", $$ThemeToggle, {})} <a href="https://github.com/crs48/xNet" aria-label="xNet on GitHub" class="hidden sm:flex items-center rounded-lg border border-border p-1.5 text-gray-600 dark:text-gray-300 hover:border-indigo-500/50 hover:bg-surface transition-all"> <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path></svg> </a> </div> </nav> </header>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/Nav.astro", void 0);

const $$Footer = createComponent(($$result, $$props, $$slots) => {
  const productLinks = [
    { label: "Try the App", href: "/app" },
    { label: "Run on Mobile", href: "/mobile" },
    { label: "Download Desktop", href: "/download" },
    { label: "Plugins", href: "/plugins" },
    { label: "Documentation", href: "/docs" },
    { label: "Quickstart", href: "/docs/quickstart/" },
    { label: "Changelog", href: "/changelog" }
  ];
  const cloudLinks = [
    { label: "xNet Cloud", href: "/cloud" },
    { label: "Pricing", href: "/cloud/pricing" },
    { label: "Open metrics", href: "/open" },
    { label: "Status", href: "/status" }
  ];
  const developLinks = [
    { label: "XNet for React", href: "/react" },
    { label: "Build with any language", href: "/build-with" },
    { label: "Swift SDK", href: "/docs/languages/swift/" },
    { label: "Rust core", href: "/docs/languages/rust/" },
    { label: "DevTools", href: "/devtool" },
    { label: "React Hooks", href: "/docs/hooks/overview/" },
    { label: "Your own server", href: "/docs/guides/server/" }
  ];
  const resourceLinks = [
    { label: "Why xNet", href: "/why" },
    { label: "Blog", href: "/blog" },
    { label: "Compare", href: "/compare" },
    { label: "Commitments", href: "/commitments" },
    { label: "Roadmap", href: "/#roadmap" },
    { label: "Architecture", href: "/docs/architecture/overview/" },
    { label: "Contributing", href: "/docs/contributing/getting-started/" }
  ];
  const communityLinks = [
    { label: "GitHub", href: "https://github.com/crs48/xNet" },
    { label: "GitHub Discussions", href: "https://github.com/crs48/xNet/discussions" },
    { label: "Governance", href: "https://github.com/crs48/xNet/blob/main/GOVERNANCE.md" },
    { label: "Trademark & Brand", href: "https://github.com/crs48/xNet/blob/main/TRADEMARK.md" },
    { label: "Code of Conduct", href: "https://github.com/crs48/xNet/blob/main/CODE_OF_CONDUCT.md" }
  ];
  const legalLinks = [
    { label: "MIT License", href: "https://github.com/crs48/xNet/blob/main/LICENSE" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Acceptable Use", href: "/acceptable-use" },
    { label: "Sub-processors", href: "/subprocessors" }
  ];
  return renderTemplate`${maybeRenderHead()}<footer class="border-t border-border/50 bg-surface/10 dark:bg-surface/20"> <div class="mx-auto max-w-6xl px-6 py-12 lg:py-16"> <!-- Main footer content --> <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-7"> <!-- Brand --> <div class="lg:col-span-2"> <a href="/" class="inline-flex items-center gap-2"> <span class="font-mono text-xl font-bold text-gray-800 dark:text-white">xNet</span> </a> <p class="mt-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
Local-first apps that work offline, sync peer-to-peer, and keep your data under your control.
</p> <div class="mt-6 flex gap-4"> <a href="https://github.com/crs48/xNet" target="_blank" rel="noopener noreferrer" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors" aria-label="GitHub"> <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"> <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path> </svg> </a> <a href="https://github.com/crs48/xNet/discussions" target="_blank" rel="noopener noreferrer" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors" aria-label="GitHub Discussions"> <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"> <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"></path> </svg> </a> </div> </div> <!-- Product --> <div> <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Product</h4> <ul class="space-y-3"> ${productLinks.map((link) => renderTemplate`<li> <a${addAttribute(link.href, "href")} class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"> ${link.label} </a> </li>`)} </ul> </div> <!-- Cloud --> <div> <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Cloud</h4> <ul class="space-y-3"> ${cloudLinks.map((link) => renderTemplate`<li> <a${addAttribute(link.href, "href")} class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"> ${link.label} </a> </li>`)} </ul> </div> <!-- Develop --> <div> <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Develop</h4> <ul class="space-y-3"> ${developLinks.map((link) => renderTemplate`<li> <a${addAttribute(link.href, "href")} class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"> ${link.label} </a> </li>`)} </ul> </div> <!-- Resources --> <div> <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Resources</h4> <ul class="space-y-3"> ${resourceLinks.map((link) => renderTemplate`<li> <a${addAttribute(link.href, "href")} class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"> ${link.label} </a> </li>`)} </ul> </div> <!-- Community --> <div> <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Community</h4> <ul class="space-y-3"> ${communityLinks.map((link) => renderTemplate`<li> <a${addAttribute(link.href, "href")} target="_blank" rel="noopener noreferrer" class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"> ${link.label} </a> </li>`)} </ul> </div> </div> <!-- Bottom bar --> <div class="mt-12 pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4"> <p class="text-sm text-gray-500">
&copy; ${(/* @__PURE__ */ new Date()).getFullYear()} xNet. Open source under MIT License.
</p> <div class="flex items-center gap-6"> ${legalLinks.map((link) => renderTemplate`<a${addAttribute(link.href, "href")} class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"> ${link.label} </a>`)} </div> </div> </div> </footer>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/Footer.astro", void 0);

export { $$Base as $, $$Nav as a, $$Footer as b };
