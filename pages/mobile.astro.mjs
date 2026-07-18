import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead, u as unescapeHTML, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import QRCode from 'qrcode';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
export { renderers } from '../renderers.mjs';

const $$Mobile = createComponent(async ($$result, $$props, $$slots) => {
  const DEMO_SOURCE = "https://github.com/crs48/xNet/tree/main/apps/expo";
  const EXPO_GO_DEMO_URL = DEMO_SOURCE;
  const hostedConfigured = Boolean(undefined                                       );
  const qrSvg = await QRCode.toString(EXPO_GO_DEMO_URL, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0a0a0f", light: "#ffffff" }
  });
  const runSteps = [
    {
      n: 1,
      title: "Install Expo Go",
      body: "Grab the free Expo Go app from the App Store or Google Play. No account needed."
    },
    {
      n: 2,
      title: "Scan the code",
      body: "Point your camera at the QR (iOS) or scan it from inside Expo Go (Android)."
    },
    {
      n: 3,
      title: "xNet opens",
      body: "The demo loads straight into Expo Go — no App Store review, no sideloading, no waiting."
    }
  ];
  const buildingBlocks = [
    {
      title: "Local-first storage",
      body: "Every document lives in on-device SQLite (expo-sqlite). Create data with the network off — it is already saved."
    },
    {
      title: "The same core as the web",
      body: "The demo imports the exact @xnetjs/core, @xnetjs/data and @xnetjs/react packages the web app uses — one data contract, every platform."
    },
    {
      title: "Real identity, on device",
      body: "A signing key is generated and held in the secure enclave (expo-secure-store); every change is signed and hash-chained."
    },
    {
      title: "Native-fast reads",
      body: "Queries hit SQLite directly through the React hooks — no bridge round-trips, no spinner tax on scroll."
    }
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Run xNet on your phone — the mobile demo, via Expo Go", "description": "Scan a QR code and run the xNet mobile demo on your device through Expo Go. No App Store, no sideloading — see the local-first building blocks (on-device SQLite, signed changes, native-fast reads) in seconds." }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="relative min-h-screen pt-32 pb-24"> <!-- Subtle gradient background --> <div class="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.04] via-transparent to-transparent"></div> <div class="absolute left-1/2 top-0 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-indigo-500/[0.06] blur-[100px]"></div> <div class="relative mx-auto max-w-5xl px-6"> <!-- Header --> <div class="mb-14 text-center"> <span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 font-mono text-xs text-indigo-600 dark:text-indigo-400">
For developers · Expo Go
</span> <h1 class="mt-5 mb-4 text-4xl font-bold tracking-tight sm:text-5xl"> <span class="bg-gradient-to-br from-gray-900 via-gray-700 to-indigo-600 dark:from-white dark:via-gray-100 dark:to-indigo-400 bg-clip-text text-transparent">
Run xNet on your phone
</span> </h1> <p class="mx-auto max-w-2xl text-lg text-gray-500 dark:text-gray-400">
A tiny mobile demo of the xNet building blocks — on-device SQLite, signed
          local-first changes, native-fast reads — running inside <strong class="text-gray-700 dark:text-gray-200">Expo Go</strong>.
          No App Store, no sideloading. Scan and see how little it takes.
</p> </div> <!-- Scan + steps --> <div class="mb-14 grid items-center gap-8 lg:grid-cols-[auto,1fr]"> <!-- QR card --> <div class="mx-auto flex flex-col items-center rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 backdrop-blur-sm p-6"> <div class="w-52 rounded-xl bg-white p-4 shadow-sm [&>svg]:h-auto [&>svg]:w-full">${unescapeHTML(qrSvg)}</div> <a${addAttribute(EXPO_GO_DEMO_URL, "href")} class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"> ${hostedConfigured ? "Open in Expo Go" : "Open the demo source"} <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"> <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path> </svg> </a> ${!hostedConfigured && renderTemplate`<p class="mt-2 max-w-[13rem] text-center text-xs text-gray-400 dark:text-gray-500">
Hosted one-scan launch lands when a published Expo Go build is wired up. Until then, run it yourself below — it takes about a minute.
</p>`} </div> <!-- Steps --> <ol class="space-y-4"> ${runSteps.map((step) => renderTemplate`<li class="flex gap-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-gray-900/40 p-5"> <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400"> ${step.n} </span> <div> <h3 class="font-semibold text-gray-900 dark:text-white">${step.title}</h3> <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">${step.body}</p> </div> </li>`)} </ol> </div> <!-- What you're running --> <section class="mb-14"> <h2 class="mb-6 text-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
What you're actually running
</h2> <div class="grid gap-4 sm:grid-cols-2"> ${buildingBlocks.map((block) => renderTemplate`<div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 p-6"> <h3 class="mb-1.5 font-semibold text-gray-900 dark:text-white">${block.title}</h3> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${block.body}</p> </div>`)} </div> </section> <!-- Run it yourself --> <section class="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm p-8"> <div class="mb-5 flex items-center gap-3"> <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800"> <svg class="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"> <path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path> </svg> </div> <div> <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Run it yourself</h3> <p class="text-sm text-gray-500 dark:text-gray-400">Clone the repo and Expo will print its own QR — scan it with Expo Go.</p> </div> </div> <div class="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-[var(--lp-code-bg)] p-4"> <button class="copy-btn absolute right-3 top-3 rounded-md border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"${addAttribute(`git clone https://github.com/crs48/xNet
cd xNet && pnpm install
pnpm --filter xnet-mobile start`, "data-copy")}>Copy</button> <pre class="text-sm leading-relaxed"><code><span class="text-gray-400 dark:text-gray-500"># 1. get the code + deps</span>
git clone https://github.com/crs48/xNet
cd xNet && pnpm install

<span class="text-gray-400 dark:text-gray-500"># 2. start the mobile demo — scan the QR it prints</span>
pnpm --filter xnet-mobile start</code></pre> </div> <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
The demo lives in
<a${addAttribute(DEMO_SOURCE, "href")} class="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">apps/expo</a>.
          It uses only modules bundled into Expo Go (expo-sqlite, expo-secure-store,
          react-native-webview), so there's no custom native build to make — it just runs.
          Want the full app instead?
<a href="/app" class="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Use it in your browser</a>
or <a href="/download" class="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">download the desktop app</a>.
</p> </section> <!-- Honest note --> <div class="mt-8 flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4"> <svg class="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"> <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path> </svg> <div> <p class="text-sm font-medium text-blue-900 dark:text-blue-100">This is a demo, running in Expo Go</p> <p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
Expo Go is Apple- and Google-approved, so it sidesteps the App Store entirely — but it's a host
            app, not xNet on your home screen. It's here to show, fast, how little friction there is between
            the xNet primitives and a working app on real hardware.
</p> </div> </div> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/mobile.astro", void 0);
const $$file = "/home/runner/work/xNet/xNet/site/src/pages/mobile.astro";
const $$url = "/mobile";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Mobile,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
