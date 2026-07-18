import { a as createComponent, m as maybeRenderHead, f as renderComponent, d as renderTemplate, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$Badge } from '../chunks/Badge_Cy_MVeE-.mjs';
import { $ as $$SectionHeader } from '../chunks/SectionHeader_C1QfMrnP.mjs';
import { $ as $$CodeBlock } from '../chunks/CodeBlock_8tlStNyV.mjs';
import { c as commitments } from '../chunks/commitments_fGyc8XRW.mjs';
import { r as rowCount, c as chipCount } from '../chunks/compare_gKySB9Il.mjs';
export { renderers } from '../renderers.mjs';

const $$Hero = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden"> <!-- Grid background --> <div class="absolute inset-0 bg-[linear-gradient(rgba(79,70,229,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(79,70,229,0.03)_1px,transparent_1px)] bg-[size:64px_64px]"></div> <!-- Radial glow --> <div class="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-indigo-500/[0.07] blur-[120px]"></div> <div class="relative mx-auto max-w-6xl px-6 py-32 lg:py-40"> <div class="text-center"> <div class="flex justify-center mb-8"> ${renderComponent($$result, "Badge", $$Badge, {}, { "default": ($$result2) => renderTemplate` <span class="relative flex h-2 w-2"> <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span> <span class="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span> </span>
Pre-release &mdash; built in the open
` })} </div> <h1 class="text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl"> <span class="bg-gradient-to-br from-gray-900 via-gray-700 to-indigo-600 dark:from-white dark:via-gray-100 dark:to-indigo-400 bg-clip-text text-transparent">
Your data. Your devices.<br>Your rules.
</span> </h1> <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-500 dark:text-gray-400 sm:text-xl">
xNet is a local-first platform for apps that work offline,
        sync peer-to-peer, and keep your data under your control.
<!-- Nominative fair use: a comparative simile, word-only (no logo or
             trade dress); the linked essay carries the trademark disclaimer. --> <a href="/blog/clutch-power" class="text-inherit underline decoration-dotted decoration-gray-400/40 underline-offset-4 transition-colors hover:text-gray-700 hover:decoration-gray-500/70 dark:decoration-gray-500/40 dark:hover:text-gray-200 dark:hover:decoration-gray-400/70">It&rsquo;s like Lego for the web.</a> </p> <!-- Three-path CTAs --> <div class="mt-12 grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto"> <!-- Use the App --> <a href="/app" class="group rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5 text-left transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10"> <div class="flex items-center gap-2 mb-2"> <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400"> <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"></path> </svg> </div> <span class="text-sm font-semibold text-emerald-400">Use the App</span> </div> <p class="text-xs text-gray-500 dark:text-gray-400">
Documents, databases, canvas. Free, offline, private.
</p> </a> <!-- Build with SDK --> <a href="#developers" class="group rounded-xl border border-indigo-500/30 bg-indigo-500/[0.05] p-5 text-left transition-all hover:border-indigo-500/50 hover:bg-indigo-500/10"> <div class="flex items-center gap-2 mb-2"> <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400"> <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path> </svg> </div> <span class="text-sm font-semibold text-indigo-400">Build with SDK</span> </div> <p class="text-xs text-gray-500 dark:text-gray-400">
3 hooks, TypeScript, React. Zero backend.
</p> </a> <!-- The Vision --> <a href="#vision" class="group rounded-xl border border-purple-500/30 bg-purple-500/[0.05] p-5 text-left transition-all hover:border-purple-500/50 hover:bg-purple-500/10"> <div class="flex items-center gap-2 mb-2"> <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400"> <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"></path> </svg> </div> <span class="text-sm font-semibold text-purple-400">The Vision</span> </div> <p class="text-xs text-gray-500 dark:text-gray-400">
Decentralized data layer for the open web.
</p> </a> </div> <!-- Install command --> <div class="mt-10 flex justify-center"> <div class="group relative inline-flex items-center gap-3 rounded-lg border border-border bg-surface/30 dark:bg-surface/50 px-5 py-2.5 font-mono text-sm text-gray-500 dark:text-gray-400"> <span class="text-indigo-400">$</span> <span>pnpm add @xnetjs/react @xnetjs/data</span> <button class="copy-btn rounded border border-border px-1.5 py-0.5 text-xs text-gray-600 hover:text-gray-900 dark:hover:text-gray-300 transition-colors" data-copy="pnpm add @xnetjs/react @xnetjs/data" aria-label="Copy install command">
Copy
</button> </div> </div> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/Hero.astro", void 0);

const $$WhatIsXNet = createComponent(($$result, $$props, $$slots) => {
  const layers = [
    {
      title: "A productivity app",
      description: "Documents, databases, canvas, tasks. Like Notion, but your data stays on your device.",
      icon: "app",
      color: "emerald"
    },
    {
      title: "A developer toolkit",
      description: "React hooks, TypeScript schemas, real-time sync. Build local-first apps in minutes.",
      icon: "sdk",
      color: "indigo"
    },
    {
      title: "An open ecosystem",
      description: "A protocol for apps to share data across devices, users, and even other apps.",
      icon: "protocol",
      color: "purple"
    }
  ];
  const colorMap = {
    emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/[0.05]", text: "text-emerald-400", iconBg: "bg-emerald-500/10" },
    indigo: { border: "border-indigo-500/30", bg: "bg-indigo-500/[0.05]", text: "text-indigo-400", iconBg: "bg-indigo-500/10" },
    purple: { border: "border-purple-500/30", bg: "bg-purple-500/[0.05]", text: "text-purple-400", iconBg: "bg-purple-500/10" }
  };
  return renderTemplate`${maybeRenderHead()}<section id="what-is-xnet" class="py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "What is xNet?", "subtitle": "Three layers. Use just the app. Or build your own. Or join the movement.", "align": "center" })} <div class="mt-12 grid gap-6 sm:grid-cols-3"> ${layers.map((layer, index) => {
    const c = colorMap[layer.color];
    return renderTemplate`<div${addAttribute(`animate-on-scroll rounded-xl border ${c.border} ${c.bg} p-6 transition-all duration-300 hover:border-opacity-80`, "class")}> <div class="flex items-center gap-3 mb-4"> <div${addAttribute(`flex h-10 w-10 items-center justify-center rounded-lg ${c.iconBg} ${c.text}`, "class")}> ${layer.icon === "app" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path> </svg>`} ${layer.icon === "sdk" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path> </svg>`} ${layer.icon === "protocol" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path> </svg>`} </div> <span${addAttribute(`text-xs font-medium uppercase tracking-wider ${c.text}`, "class")}> ${index === 0 ? "App Layer" : index === 1 ? "SDK Layer" : "Protocol Layer"} </span> </div> <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">${layer.title}</h3> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${layer.description}</p> </div>`;
  })} </div> <!-- Connecting text --> <p class="mt-10 text-center text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
Each layer builds on the last. The app uses the SDK. The SDK implements the protocol.
      Start wherever makes sense for you.
</p> <p class="mt-4 text-center text-sm text-gray-500 dark:text-gray-400"> <a href="/why" class="text-indigo-600 dark:text-indigo-400 underline decoration-dotted underline-offset-2 hover:text-indigo-500">
Why does any of this matter? →
</a> </p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/WhatIsXNet.astro", void 0);

const $$TheApp = createComponent(($$result, $$props, $$slots) => {
  const tools = [
    {
      title: "Documents",
      description: "Write and collaborate in real-time. Slash commands, blocks, formatting \u2014 everything syncs instantly between your devices and teammates.",
      icon: "doc",
      color: "indigo"
    },
    {
      title: "Databases",
      description: "Track anything with 15 field types. See your data as tables, boards, galleries, or calendars. Filter, sort, and group your way.",
      icon: "db",
      color: "emerald"
    },
    {
      title: "Canvas",
      description: "Visual thinking on an infinite whiteboard. Arrange ideas freely, draw and edit connections, embed documents. Like Miro meets Obsidian.",
      icon: "canvas",
      color: "amber"
    },
    {
      title: "Tasks",
      description: "Manage projects with status, priority, assignees, and due dates. Edit tasks in place on any surface \u2014 boards, lists, pages, or the sidebar.",
      icon: "task",
      color: "pink"
    },
    {
      title: "Dashboards",
      description: "Metrics, charts, and feeds over your live data. Pick from built-in widgets or write your own \u2014 they run sandboxed and sync like everything else.",
      icon: "dashboard",
      color: "cyan"
    },
    {
      title: "Chat & Calls",
      description: "Channels, DMs, and peer-to-peer video calls \u2014 built on the same local-first sync as your documents. Every page gets its own discussion thread.",
      icon: "chat",
      color: "violet"
    },
    {
      title: "Notifications",
      description: "Mentions, assignments, and replies land in a private inbox derived locally from sync \u2014 no notification server reading your activity.",
      icon: "bell",
      color: "rose"
    },
    {
      title: "Instant search",
      description: "One palette (\u2318K) opens anything, runs any command, and full-text searches every page \u2014 entirely on your device.",
      icon: "search",
      color: "sky"
    },
    {
      title: "AI assistant",
      description: "A built-in assistant that retrieves over your own knowledge graph (GraphRAG) and scaffolds content \u2014 grounded in your workspace, with optional on-device semantic search.",
      icon: "spark",
      color: "violet"
    },
    {
      title: "CRM & contacts",
      description: "People, companies, and deals with a per-person dashboard. A relational CRM that is just nodes in your store \u2014 no separate database to wire up.",
      icon: "people",
      color: "cyan"
    },
    {
      title: "Finance",
      description: "Double-entry accounting with accounts, transactions, and postings. Money is kept as exact integer minor units, so the books always balance.",
      icon: "ledger",
      color: "emerald"
    },
    {
      title: "Experiments",
      description: "A habit and metric tracker with streaks and trend math. Run experiments on yourself or your team and watch the numbers move.",
      icon: "beaker",
      color: "amber"
    },
    {
      title: "Maps",
      description: "Live, query-driven layers over your data on a satellite or vector basemap \u2014 your places and routes plotted from the same nodes.",
      icon: "map",
      color: "rose"
    },
    {
      title: "Labs",
      description: "A sandboxed code surface to compute over your nodes on a tiered runtime ladder \u2014 notebooks and small tools, right inside the workspace.",
      icon: "code",
      color: "indigo"
    }
  ];
  const colorMap = {
    indigo: { border: "border-indigo-500/20", bg: "bg-indigo-500/[0.03]", text: "text-indigo-400", iconBg: "bg-indigo-500/10" },
    emerald: { border: "border-emerald-500/20", bg: "bg-emerald-500/[0.03]", text: "text-emerald-400", iconBg: "bg-emerald-500/10" },
    amber: { border: "border-amber-500/20", bg: "bg-amber-500/[0.03]", text: "text-amber-400", iconBg: "bg-amber-500/10" },
    pink: { border: "border-pink-500/20", bg: "bg-pink-500/[0.03]", text: "text-pink-400", iconBg: "bg-pink-500/10" },
    cyan: { border: "border-cyan-500/20", bg: "bg-cyan-500/[0.03]", text: "text-cyan-400", iconBg: "bg-cyan-500/10" },
    violet: { border: "border-violet-500/20", bg: "bg-violet-500/[0.03]", text: "text-violet-400", iconBg: "bg-violet-500/10" },
    rose: { border: "border-rose-500/20", bg: "bg-rose-500/[0.03]", text: "text-rose-400", iconBg: "bg-rose-500/10" },
    sky: { border: "border-sky-500/20", bg: "bg-sky-500/[0.03]", text: "text-sky-400", iconBg: "bg-sky-500/10" }
  };
  return renderTemplate`${maybeRenderHead()}<section id="app" class="border-y border-border/50 bg-surface/10 dark:bg-surface/20 py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "Your whole workspace. One app.", "subtitle": "Documents, databases, canvas, tasks, dashboards, an AI assistant, CRM, finance, maps, chat \u2014 in a keyboard-first workbench that works offline, syncs across your devices, and keeps your data private. No account required. Free forever.", "align": "center" })} <!-- App preview / CTA --> <div class="mt-12 max-w-4xl mx-auto animate-on-scroll"> <div class="relative rounded-xl border border-border overflow-hidden bg-gradient-to-b from-surface/50 to-surface/30 dark:from-surface/80 dark:to-surface/50"> <!-- App window mockup --> <div class="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-surface/50"> <div class="flex gap-1.5"> <span class="w-3 h-3 rounded-full bg-red-500/60"></span> <span class="w-3 h-3 rounded-full bg-yellow-500/60"></span> <span class="w-3 h-3 rounded-full bg-green-500/60"></span> </div> <span class="text-xs text-gray-500 ml-2">xNet</span> </div> <!-- Workbench screenshot (light/dark follow the page theme) --> <img src="/images/workbench-light.png" alt="The xNet workbench in light mode: a Q3 Launch Plan document with a launch checklist, tabbed pages, and the Explorer sidebar showing spaces, folders, and tags" class="block w-full dark:hidden" width="1600" height="1000" loading="lazy"> <img src="/images/workbench-dark.png" alt="The xNet workbench in dark mode: a Q3 Launch Plan document with a launch checklist, tabbed pages, and the Explorer sidebar showing spaces, folders, and tags" class="hidden w-full dark:block" width="1600" height="1000" loading="lazy"> </div> <div class="mt-6 text-center"> <a href="/app" class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors">
Try the App
<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path> </svg> </a> <p class="mt-3 text-sm text-gray-500">Free in your browser — no account, no install.</p> </div> </div> <!-- Key differentiators --> <div class="mx-auto mt-12 max-w-3xl animate-on-scroll"> <div class="rounded-xl border border-border bg-surface/30 dark:bg-surface/50 p-6 sm:p-8"> <div class="grid gap-6 sm:grid-cols-2"> <div> <div class="flex items-center gap-2 mb-2"> <svg class="h-4 w-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg> <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Your data stays on your device</h4> </div> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
Unlike cloud apps, your files never leave your computer unless you want them to. No servers reading your notes. No accounts to create.
</p> </div> <div> <div class="flex items-center gap-2 mb-2"> <svg class="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"></path></svg> <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Works offline, syncs automatically</h4> </div> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
Edit on a plane, in the subway, anywhere. When you're back online, changes sync between your devices without you lifting a finger.
</p> </div> </div> </div> </div> <!-- Tools grid --> <div class="mt-12 grid gap-5 sm:grid-cols-2"> ${tools.map((tool) => {
    const c = colorMap[tool.color];
    return renderTemplate`<div${addAttribute(`animate-on-scroll rounded-xl border ${c.border} ${c.bg} p-6 transition-all duration-300 hover:border-opacity-60`, "class")}> <div class="flex items-center gap-3 mb-3"> <div${addAttribute(`flex h-8 w-8 items-center justify-center rounded-lg ${c.iconBg} ${c.text}`, "class")}> ${tool.icon === "doc" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`} ${tool.icon === "db" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path></svg>`} ${tool.icon === "canvas" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5z"></path></svg>`} ${tool.icon === "task" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>`} ${tool.icon === "dashboard" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>`} ${tool.icon === "chat" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>`} ${tool.icon === "bell" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>`} ${tool.icon === "search" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>`} ${tool.icon === "spark" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"></path></svg>`} ${tool.icon === "people" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`} ${tool.icon === "ledger" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`} ${tool.icon === "beaker" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21a48.25 48.25 0 01-8.135-.687c-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"></path></svg>`} ${tool.icon === "map" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"></path></svg>`} ${tool.icon === "code" && renderTemplate`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"></path></svg>`} </div> <h3${addAttribute(`font-semibold ${c.text}`, "class")}>${tool.title}</h3> </div> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${tool.description}</p> </div>`;
  })} </div> <!-- Platforms + contribute CTA --> <div class="mt-12 animate-on-scroll"> <div class="rounded-xl border border-border bg-code-bg p-6 sm:p-8"> <div class="grid gap-8 sm:grid-cols-3"> <div class="text-center"> <svg class="mx-auto h-8 w-8 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke-width="1.5"></rect><line x1="8" y1="21" x2="16" y2="21" stroke-width="1.5"></line><line x1="12" y1="17" x2="12" y2="21" stroke-width="1.5"></line></svg> <strong class="text-sm text-gray-700 dark:text-gray-200">Desktop</strong> <p class="text-xs text-gray-500 mt-1">Electron &mdash; full features, plugins, background services</p> </div> <div class="text-center"> <svg class="mx-auto h-8 w-8 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="1.5"></circle><line x1="2" y1="12" x2="22" y2="12" stroke-width="1.5"></line><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke-width="1.5"></path></svg> <strong class="text-sm text-gray-700 dark:text-gray-200">Web</strong> <p class="text-xs text-gray-500 mt-1">PWA &mdash; works in any browser, installable</p> </div> <div class="text-center"> <svg class="mx-auto h-8 w-8 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" stroke-width="1.5"></rect><line x1="10" y1="18" x2="14" y2="18" stroke-width="1.5"></line></svg> <strong class="text-sm text-gray-700 dark:text-gray-200">Mobile</strong> <p class="text-xs text-gray-500 mt-1">Expo &mdash; iOS and Android (coming soon)</p> </div> </div> <p class="mt-6 text-center text-sm text-gray-500">
Free forever. Self-hostable. Every feature is open source and will stay that way.
</p> </div> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/TheApp.astro", void 0);

const $$BuiltWithAI = createComponent(($$result, $$props, $$slots) => {
  const points = [
    {
      title: "Grounded in your graph",
      description: "The assistant retrieves over your own nodes and links (GraphRAG) \u2014 answers are drawn from your workspace, not a stranger\u2019s training set.",
      icon: "graph"
    },
    {
      title: "Search that runs on-device",
      description: "Opt-in in-browser vectors give semantic and hybrid search with nothing leaving the device. Your embeddings stay yours.",
      icon: "chip"
    },
    {
      title: "Bring a key, or use managed",
      description: "Point at your own provider, or use the metered managed gateway with a model picker. Switch models without touching your data.",
      icon: "key"
    },
    {
      title: "Marked, never masked",
      description: "AI-generated content is badged right in the editor. The assistant helps you write \u2014 it doesn\u2019t quietly impersonate you.",
      icon: "badge"
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section id="ai" class="border-y border-border/50 bg-surface/10 dark:bg-surface/20 py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "An assistant that lives in your data", "subtitle": "xNet is AI-native: retrieval over your own knowledge graph, optional on-device vectors, and a clear line between you and the model.", "align": "center" })} <div class="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"> ${points.map((point) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-6 transition-all duration-300 hover:border-violet-500/40"> <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400"> ${point.icon === "graph" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M5 7a2 2 0 100-4 2 2 0 000 4zm0 0v10m0 0a2 2 0 104 0 2 2 0 00-4 0zm14-8a2 2 0 11-4 0 2 2 0 014 0zm0 0c0 4-7 2-7 8m0 0a2 2 0 104 0 2 2 0 00-4 0z"></path> </svg>`} ${point.icon === "chip" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 7h10v10H7V7z"></path> </svg>`} ${point.icon === "key" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path> </svg>`} ${point.icon === "badge" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path> </svg>`} </div> <h4 class="font-semibold text-gray-800 dark:text-gray-100 mb-1.5">${point.title}</h4> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed"> ${point.description} </p> </div>`)} </div> <div class="mt-12 flex flex-wrap justify-center gap-4"> <a href="/app" class="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500 transition-colors">
Try the assistant
</a> <a href="/commitments" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-violet-500/50 hover:bg-surface transition-all">
How we handle AI &amp; your data
</a> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/BuiltWithAI.astro", void 0);

const $$ForDevelopers = createComponent(($$result, $$props, $$slots) => {
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const fn = (s) => `<span class="tok-function">${s}</span>`;
  const str = (s) => `<span class="tok-string">${s}</span>`;
  const num = (s) => `<span class="tok-number">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const threeHooksCode = [
    `${kw("import")} { defineSchema, text, person } ${kw("from")} ${str("'@xnetjs/data'")}`,
    `${kw("import")} { allow, role } ${kw("from")} ${str("'@xnetjs/data/auth'")}`,
    `${kw("import")} { useIdentity, useQuery, useMutate, useNode } ${kw("from")} ${str("'@xnetjs/react'")}`,
    ``,
    `${cm("// Schema with built-in authorization")}`,
    `${kw("const")} TaskSchema = ${fn("defineSchema")}({`,
    `  name: ${str("'Task'")},`,
    `  namespace: ${str("'xnet://my-app/'")},`,
    `  properties: {`,
    `    title: ${fn("text")}({ required: ${num("true")} }),`,
    `    assignee: ${fn("person")}()`,
    `  },`,
    `  authorization: {`,
    `    roles: {`,
    `      owner: ${fn("role.creator")}(),`,
    `      assignee: ${fn("role.property")}(${str("'assignee'")})`,
    `    },`,
    `    actions: {`,
    `      read: ${fn("allow")}(${str("'owner'")}, ${str("'assignee'")}),`,
    `      write: ${fn("allow")}(${str("'owner'")}),`,
    `      share: ${fn("allow")}(${str("'owner'")})`,
    `    }`,
    `  }`,
    `})`,
    ``,
    `${cm("// useIdentity \u2014 current DID and auth state")}`,
    `${kw("const")} { did, isAuthenticated } = ${fn("useIdentity")}()`,
    `${kw("if")} (!isAuthenticated) ${kw("return")} ${str("null")}`,
    ``,
    `${cm("// 1. useQuery \u2014 read data")}`,
    `${kw("const")} { data: tasks } = ${fn("useQuery")}(TaskSchema, {`,
    `  where: { assignee: did }`,
    `})`,
    ``,
    `${cm("// 2. useMutate \u2014 write data")}`,
    `${kw("const")} { create, update, remove } = ${fn("useMutate")}()`,
    `${fn("create")}(TaskSchema, { title: ${str("'New task'")} })`,
    ``,
    `${cm("// 3. useNode \u2014 real-time collaboration")}`,
    `${kw("const")} { doc, peerCount } = ${fn("useNode")}(PageSchema, id)`,
    `${cm("// Plug doc into TipTap, ProseMirror, etc.")}`
  ].join("\n");
  const whatYouGet = [
    "Full TypeScript inference from schemas",
    "Offline-first by default",
    "P2P sync with no server code",
    "Works with any AI coding assistant"
  ];
  const whatYouSkip = [
    "Backend deployment",
    "Auth configuration",
    "Database setup",
    "API design"
  ];
  return renderTemplate`${maybeRenderHead()}<section id="developers" class="py-24 lg:py-32 border-t border-border/50"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "For Developers", "subtitle": "Build local-first apps with three React hooks \u2014 storage, crypto, and networking handled for you. Sync peer-to-peer, through a managed Hub, or against your own backend.", "align": "center" })} <!-- Three hooks code example --> <div class="mt-12 max-w-2xl mx-auto"> ${renderComponent($$result, "CodeBlock", $$CodeBlock, { "filename": "App.tsx", "code": threeHooksCode })} </div> <!-- What you get / What you skip --> <div class="mt-16 grid gap-8 sm:grid-cols-2 max-w-4xl mx-auto"> <div class="animate-on-scroll rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6"> <h3 class="text-lg font-semibold text-emerald-400 mb-4">What you get</h3> <ul class="space-y-3"> ${whatYouGet.map((item) => renderTemplate`<li class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300"> <svg class="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path> </svg> ${item} </li>`)} </ul> </div> <div class="animate-on-scroll rounded-xl border border-gray-500/20 bg-gray-500/[0.03] p-6"> <h3 class="text-lg font-semibold text-gray-400 mb-4">What you skip</h3> <ul class="space-y-3"> ${whatYouSkip.map((item) => renderTemplate`<li class="flex items-start gap-3 text-sm text-gray-500 dark:text-gray-400"> <svg class="h-5 w-5 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path> </svg> <span class="line-through">${item}</span> </li>`)} </ul> </div> </div> <!-- Before/After comparison (compact) --> <div class="mt-16 max-w-4xl mx-auto"> <h3 class="text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-8">
Architecture comparison
</h3> <div class="grid gap-6 md:grid-cols-2"> <!-- Traditional --> <div class="animate-on-scroll rounded-xl border border-border bg-surface/30 dark:bg-surface/50 p-5"> <div class="text-xs font-medium text-gray-500 mb-4">Before xNet</div> <div class="space-y-2 text-xs text-gray-500"> <div class="flex items-center gap-2"> <span class="w-4 h-4 rounded border border-gray-400/30 flex items-center justify-center text-gray-400">&#9744;</span>
Database (Postgres)
</div> <div class="flex items-center gap-2"> <span class="w-4 h-4 rounded border border-gray-400/30 flex items-center justify-center text-gray-400">&#9744;</span>
API layer (REST/GraphQL)
</div> <div class="flex items-center gap-2"> <span class="w-4 h-4 rounded border border-gray-400/30 flex items-center justify-center text-gray-400">&#9744;</span>
Auth service (Auth0)
</div> <div class="flex items-center gap-2"> <span class="w-4 h-4 rounded border border-gray-400/30 flex items-center justify-center text-gray-400">&#9744;</span>
Real-time (WebSockets)
</div> <div class="flex items-center gap-2"> <span class="w-4 h-4 rounded border border-gray-400/30 flex items-center justify-center text-gray-400">&#9744;</span>
Offline sync (custom)
</div> <div class="flex items-center gap-2"> <span class="w-4 h-4 rounded border border-gray-400/30 flex items-center justify-center text-gray-400">&#9744;</span>
Deployment (Vercel)
</div> </div> </div> <!-- xNet --> <div class="animate-on-scroll rounded-xl border border-indigo-500/30 bg-indigo-500/[0.03] p-5"> <div class="text-xs font-medium text-indigo-400 mb-4">With xNet</div> <div class="space-y-2 text-xs"> <div class="flex items-center gap-2 text-emerald-400"> <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"> <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path> </svg> <code>pnpm add @xnetjs/react</code> </div> <div class="flex items-center gap-2 text-emerald-400"> <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"> <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path> </svg> <code>${"defineSchema({ authorization: { ... } })"}</code> </div> <div class="flex items-center gap-2 text-emerald-400"> <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"> <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path> </svg> <code>useQuery(MySchema)</code> </div> <div class="flex items-center gap-2 text-emerald-400"> <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"> <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path> </svg> <code>useIdentity()</code> </div> <div class="mt-4 pt-4 border-t border-indigo-500/10 text-indigo-300 font-medium">
Done.
</div> </div> </div> </div> </div> <!-- Backends: same hooks, three ways to sync --> <div class="mt-16 max-w-4xl mx-auto"> <h3 class="text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-8">
One client. Pick your backend.
</h3> <div class="grid gap-5 sm:grid-cols-3"> <div class="animate-on-scroll rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-5"> <h4 class="font-semibold text-emerald-400 mb-1.5">Peer-to-peer</h4> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
No server at all — devices sync directly. The zero-backend default.
</p> </div> <div class="animate-on-scroll rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-5"> <h4 class="font-semibold text-amber-400 mb-1.5">Managed Hub</h4> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
Point <code class="font-mono text-xs">XNetProvider</code> at a Hub URL for
            always-on sync, presence, and encrypted backup.
</p> </div> <div class="animate-on-scroll rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] p-5"> <h4 class="font-semibold text-indigo-400 mb-1.5">Your own server</h4> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed"> <code class="font-mono text-xs">@xnetjs/server</code> maps your auth and
            database onto the data layer — server, custodial, or signed trust.
</p> </div> </div> <p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
Prefer a different framework? <code class="font-mono text-xs">@xnetjs/runtime</code>
drives the same client from any framework, a worker, or a Node service — React
        ships first-class, with Vue/Svelte adapters a small port when you need them.
<a href="/react" class="text-indigo-600 dark:text-indigo-400 underline decoration-dotted underline-offset-2 hover:text-indigo-500">
See xNet for React →
</a> </p> </div> <!-- CTAs --> <div class="mt-12 flex flex-wrap justify-center gap-4"> <a href="/docs/quickstart/" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
Read the Docs
</a> <a href="#get-started" class="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-5 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-all">
View Examples
</a> <a href="#agents" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all">
Building with AI? &darr;
</a> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/ForDevelopers.astro", void 0);

const $$BuiltForAgents = createComponent(($$result, $$props, $$slots) => {
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const agentCode = [
    `${cm("# An agent working in a workspace checkout")}`,
    `${cm("$")} xnet checkout --query "q3 roadmap"`,
    `Pages/q3-planning.md`,
    `Databases/tasks.rows.jsonl`,
    ``,
    `${cm("$")} grep -l "launch" Pages/ ${cm("# files are just files")}`,
    `${cm("$")} xnet query tasks --where status=open --format tsv`,
    ``,
    `${cm("# edits become validated mutation plans")}`,
    `${cm("$")} xnet commit --apply`
  ].join("\n");
  const points = [
    {
      title: "Files first",
      description: "Agents already read, grep, and edit files brilliantly. xNet checks out a scoped slice of the workspace as Markdown, JSONL, and JSON Canvas \u2014 the store stays the source of truth."
    },
    {
      title: "A ~500-token contract",
      description: "One cross-harness SKILL.md teaches Claude Code, Codex, Gemini CLI, or Cursor the whole workflow. That is the entire standing context cost \u2014 not thousands of tokens of tool definitions."
    },
    {
      title: "Safe by construction",
      description: "File edits become schema-validated mutation plans. Conflicts quarantine with a human-readable note instead of overwriting. An agent cannot corrupt the workspace with a malformed write."
    },
    {
      title: "~9x cheaper than MCP tools",
      description: "On a 15-task benchmark, the files+CLI surface used 0.11x the tokens of a legacy MCP toolset with equal task success. A slim MCP server remains as the no-shell fallback."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section id="agents" class="border-y border-border/50 bg-surface/10 dark:bg-surface/20 py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "Built for agents", "subtitle": "AI agents are first-class users of your workspace \u2014 through the filesystem they already know, not a wall of tool definitions.", "align": "center" })} <div class="mt-16 grid items-start gap-10 lg:grid-cols-2"> <div class="animate-on-scroll min-w-0"> ${renderComponent($$result, "CodeBlock", $$CodeBlock, { "filename": "terminal", "code": agentCode })} <p class="mt-4 text-center text-xs text-gray-500">
The same plan/validate/apply core sits behind files, the CLI, and MCP.
</p> </div> <div class="grid gap-5 sm:grid-cols-2"> ${points.map((point) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-border bg-surface p-5"> <h4 class="font-semibold text-gray-800 dark:text-gray-100 mb-1.5">${point.title}</h4> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${point.description}</p> </div>`)} </div> </div> <div class="mt-12 flex flex-wrap justify-center gap-4"> <a href="/docs/guides/agent-interfaces/" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
Agent Interfaces Guide
</a> <a href="/llms.txt" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all">
llms.txt
</a> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/BuiltForAgents.astro", void 0);

const $$Integrations = createComponent(($$result, $$props, $$slots) => {
  const connectors = ["GitHub", "Notion", "Airtable", "Linear", "RSS", "Slack", "Unreal Engine"];
  const points = [
    {
      title: "Synced into governed nodes",
      description: "A connector maps an external service into your store as normal, permissioned nodes \u2014 so the rest of xNet (search, views, AI) treats it like any other data."
    },
    {
      title: "Secrets stay in the hub",
      description: "Tokens live server-side, never in the client. Outbound calls are SSRF-guarded, so a connector can\u2019t be tricked into reaching your internal network."
    },
    {
      title: "Define your own in a few lines",
      description: "defineConnector and outbound defineAction give you a typed contract for any API \u2014 plus agent tools your assistant can act through."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section id="integrations" class="py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "Bring the rest of your stack with you", "subtitle": "Connectors pull external services into your workspace as governed data \u2014 and let you build your own when the catalog doesn\u2019t have it.", "align": "center" })} <!-- Connector chips --> <div class="mt-10 flex flex-wrap justify-center gap-2.5"> ${connectors.map((name) => renderTemplate`<span class="rounded-full border border-border bg-surface/30 dark:bg-surface/50 px-3.5 py-1.5 text-sm text-gray-600 dark:text-gray-300"> ${name} </span>`)} <span class="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1.5 text-sm text-indigo-600 dark:text-indigo-300">
+ your own
</span> </div> <!-- Capability cards --> <div class="mt-12 grid gap-5 sm:grid-cols-3"> ${points.map((point) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-border bg-surface p-6 transition-all duration-300 hover:border-indigo-500/30"> <h4 class="font-semibold text-gray-800 dark:text-gray-100 mb-1.5">${point.title}</h4> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed"> ${point.description} </p> </div>`)} </div> <div class="mt-12 flex flex-wrap justify-center gap-4"> <a href="/plugins" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
Browse plugins &amp; connectors
</a> <a href="/docs/guides/plugins/" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all">
Build a connector
</a> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/Integrations.astro", void 0);

const $$UnderTheHood = createComponent(($$result, $$props, $$slots) => {
  const pillars = [
    {
      title: "Sync",
      color: "indigo",
      items: ["Edits merge without conflicts (CRDTs)", "Devices connect directly (P2P)", "Changes are cryptographically signed", "Works offline, syncs when online"]
    },
    {
      title: "Security",
      color: "emerald",
      items: ["Hybrid classical + post-quantum signing", "ML-DSA-65 (NIST FIPS 204) ready", "Per-node end-to-end encryption", "Read access enforced by cryptography"]
    },
    {
      title: "Identity",
      color: "amber",
      items: ["You own your keys, not us", "Seed phrase key recovery", "Multi-device via deterministic derivation", "No central login server"]
    },
    {
      title: "Storage",
      color: "pink",
      items: ["Browser: SQLite (OPFS)", "Desktop/Mobile: SQLite", "Files sync peer-to-peer", "Full history, never lose changes"]
    }
  ];
  const colorText = {
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    pink: "text-pink-400"
  };
  const colorBorder = {
    indigo: "border-indigo-500/20",
    emerald: "border-emerald-500/20",
    amber: "border-amber-500/20",
    pink: "border-pink-500/20"
  };
  const colorDot = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    pink: "bg-pink-500"
  };
  return renderTemplate`${maybeRenderHead()}<section id="under-the-hood" class="py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "How it works", "subtitle": "Built on open standards and proven technology. No magic, no lock-in \u2014 just solid engineering." })} <div class="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"> ${pillars.map((pillar) => renderTemplate`<div${addAttribute(`animate-on-scroll rounded-xl border ${colorBorder[pillar.color]} bg-surface p-6 transition-all duration-300 hover:border-opacity-60`, "class")}> <h4${addAttribute(`font-semibold ${colorText[pillar.color]}`, "class")}>${pillar.title}</h4> <ul class="mt-4 space-y-2.5"> ${pillar.items.map((item) => renderTemplate`<li class="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400"> <span${addAttribute(`mt-1.5 h-1.5 w-1.5 rounded-full ${colorDot[pillar.color]} shrink-0`, "class")}></span> ${item} </li>`)} </ul> </div>`)} </div> <!-- Platforms --> <div class="mt-12 grid gap-4 sm:grid-cols-3"> <div class="animate-on-scroll flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-indigo-500/30"> <svg class="h-8 w-8 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke-width="1.5"></rect><line x1="8" y1="21" x2="16" y2="21" stroke-width="1.5"></line><line x1="12" y1="17" x2="12" y2="21" stroke-width="1.5"></line></svg> <div> <strong class="text-sm">Desktop</strong> <p class="text-xs text-gray-500">Electron &mdash; macOS, Linux, Windows</p> </div> </div> <div class="animate-on-scroll flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-indigo-500/30"> <svg class="h-8 w-8 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" stroke-width="1.5"></rect><line x1="10" y1="18" x2="14" y2="18" stroke-width="1.5"></line></svg> <div> <strong class="text-sm">Mobile</strong> <p class="text-xs text-gray-500">Expo &mdash; iOS, Android (coming soon)</p> </div> </div> <div class="animate-on-scroll flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-indigo-500/30"> <svg class="h-8 w-8 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="1.5"></circle><line x1="2" y1="12" x2="22" y2="12" stroke-width="1.5"></line><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke-width="1.5"></path></svg> <div> <strong class="text-sm">Web</strong> <p class="text-xs text-gray-500">PWA &mdash; any modern browser</p> </div> </div> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/UnderTheHood.astro", void 0);

const $$OpenProtocol = createComponent(($$result, $$props, $$slots) => {
  const layers = [
    {
      tag: "L0",
      title: "Primitives",
      desc: "did:key / Ed25519, XChaCha20-Poly1305, X25519, BLAKE3, UCAN \u2014 mostly a profile over existing standards."
    },
    {
      tag: "L1",
      title: "Data Model",
      desc: "The Node, the signed Change, and the byte-exact canonicalization that makes every implementation agree."
    },
    {
      tag: "L2",
      title: "Replication",
      desc: "The wire messages, the signed Yjs envelope, and the version handshake \u2014 bound to WebSocket and libp2p."
    },
    {
      tag: "L3",
      title: "Authorization",
      desc: "Access control as data: schema rules, role resolvers, grants, and UCAN capability tokens."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section id="open-protocol" class="py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "An open protocol, not just an app", "subtitle": "This repository is one implementation of xNet. xNet itself is a written standard \u2014 anyone can re-implement it in any language, over any database, and interoperate. Like Matrix or the AT Protocol, the spec is separate from any one codebase." })} <div class="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"> ${layers.map((layer) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-indigo-500/20 bg-surface p-6 transition-all duration-300 hover:border-indigo-500/50"> <div class="font-mono text-xs font-semibold text-indigo-400">${layer.tag}</div> <h4 class="mt-1 font-semibold">${layer.title}</h4> <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">${layer.desc}</p> </div>`)} </div> <div class="mt-10 rounded-xl border border-border bg-surface px-6 py-5"> <p class="text-sm text-gray-600 dark:text-gray-300"> <strong class="text-gray-900 dark:text-white">The interop kernel isn't Yjs.</strong>
&nbsp;Yjs is only the optional rich-text body of a node and travels the wire as opaque
        bytes — so a second implementation never has to port a CRDT. The core is a signed,
        hash-chained, last-write-wins change log, proven by a language-agnostic conformance
        corpus that ships <em>with</em> the spec. A ~100-line Python kernel already reproduces
        the same DIDs and verifies TypeScript-signed changes byte-for-byte — and a native
        Swift core goes further, holding a live, bidirectional sync session with the hub.
</p> </div> <div class="mt-10 flex flex-wrap gap-3"> <a href="/docs/protocol/overview/" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Read the protocol
</a> <a href="/docs/protocol/implement-in-your-language/" class="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-5 py-2.5 text-sm font-medium text-indigo-600 transition-all hover:bg-indigo-500/20 dark:text-indigo-300">
Implement it in your language
</a> <a href="/build-with" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-indigo-500/50 hover:bg-surface dark:text-gray-200">
Build with any language
</a> <a href="https://github.com/crs48/xNet/tree/main/docs/specs/protocol" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-indigo-500/50 hover:bg-surface dark:text-gray-200">
The normative spec
</a> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/OpenProtocol.astro", void 0);

const $$Hubs = createComponent(($$result, $$props, $$slots) => {
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const deployCode = [
    `${cm("# Deploy on Railway (recommended)")}`,
    `${cm("# https://railway.app/template/xnet-hub")}`,
    ``,
    `${cm("# Or self-host with Docker")}`,
    `${cm("$")} docker run -d -p 4444:4444 \\`,
    `    -v xnet-data:/data \\`,
    `    ghcr.io/crs48/xnet-hub:latest`,
    ``,
    `${cm("# Point your app at wss://your-hub:4444")}`
  ].join("\n");
  const features = [
    {
      title: "Always-on sync",
      description: "Your devices sync directly when both are online. When one goes offline, the Hub holds updates until it reconnects. Nothing gets lost.",
      icon: "sync"
    },
    {
      title: "Encrypted backups",
      description: "Your data is encrypted on your device before it reaches the Hub. Even we can't read it. Restore to any device, anytime.",
      icon: "backup"
    },
    {
      title: "Team permissions",
      description: "Control who can view, edit, or admin your workspaces. Permissions are enforced at the Hub \u2014 no shared passwords, no account sharing.",
      icon: "auth"
    },
    {
      title: "Web access",
      description: "Your Hub serves the xNet app directly. Share a URL with your team and they can access everything from any browser.",
      icon: "web"
    },
    {
      title: "Custom data types",
      description: "Create and share custom schemas across your team. The Hub tracks what types are available so everyone stays in sync.",
      icon: "schema"
    },
    {
      title: "File storage",
      description: "Images, attachments, and exports sync between devices. The Hub acts as always-on storage so files are available even when teammates are offline.",
      icon: "blob"
    },
    {
      title: "Full-text search",
      description: "Find any document, task, or note by its content. Search runs locally first for speed, with Hub results filling in the gaps.",
      icon: "search"
    },
    {
      title: "Call signaling",
      description: "Team voice and video rooms use the Hub to set up their peer-to-peer connections \u2014 media flows directly between participants, not through the Hub.",
      icon: "sync"
    },
    {
      title: "Abuse protection",
      description: "The Hub validates relayed messages \u2014 mention declarations are shape-checked and capped \u2014 so a hostile client can't spam your team's notifications.",
      icon: "auth"
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section id="hubs" class="py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "For Teams: Hubs", "subtitle": "xNet works without any servers \u2014 your devices sync directly. But when you want always-on availability, backups, and team access, add a Hub.", "align": "center" })} <!-- Architecture diagram --> <div class="mx-auto mt-12 max-w-3xl animate-on-scroll"> <div class="rounded-xl border border-border bg-code-bg p-6 sm:p-8"> <div class="flex flex-col items-center gap-4 font-mono text-sm"> <!-- Devices row --> <div class="flex items-center gap-4 sm:gap-8 flex-wrap justify-center"> <div class="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-indigo-300 text-center"> <div class="text-xs text-indigo-400/60 mb-0.5">Desktop</div>
Peer A
</div> <div class="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-indigo-300 text-center"> <div class="text-xs text-indigo-400/60 mb-0.5">Phone</div>
Peer B
</div> <div class="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-indigo-300 text-center"> <div class="text-xs text-indigo-400/60 mb-0.5">Browser</div>
Peer C
</div> </div> <!-- Connection lines --> <div class="flex items-center gap-2 text-gray-600"> <span class="text-xs">P2P when online</span> <span>&darr;</span> <span class="text-xs">Hub when offline</span> </div> <!-- Hub --> <div class="w-full max-w-sm rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 text-center"> <div class="text-amber-400 font-semibold mb-1">Hub</div> <div class="text-xs text-gray-500">Railway or $5/month VPS &mdash; Docker, SQLite, single process</div> <div class="mt-3 flex flex-wrap justify-center gap-2"> <span class="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400/70">Sync relay</span> <span class="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400/70">Backups</span> <span class="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400/70">Auth</span> <span class="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400/70">Search</span> <span class="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400/70">Blobs</span> </div> </div> <!-- Emphasis --> <div class="text-center text-xs text-gray-600 max-w-sm">
The Hub never sees your plaintext data. It relays encrypted updates and stores ciphertext.
            Optional — everything works without it.
</div> </div> </div> </div> <!-- Feature grid --> <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"> ${features.map((feature) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-border bg-surface p-5 transition-all duration-300 hover:border-amber-500/30"> <div class="flex items-center gap-2.5 mb-2"> ${feature.icon === "sync" && renderTemplate`<svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>`} ${feature.icon === "backup" && renderTemplate`<svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>`} ${feature.icon === "auth" && renderTemplate`<svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>`} ${feature.icon === "web" && renderTemplate`<svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"></path></svg>`} ${feature.icon === "schema" && renderTemplate`<svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>`} ${feature.icon === "blob" && renderTemplate`<svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`} ${feature.icon === "search" && renderTemplate`<svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>`} <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200">${feature.title}</h4> </div> <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${feature.description}</p> </div>`)} </div> <!-- Deploy snippet --> <div class="mx-auto mt-12 max-w-xl animate-on-scroll"> ${renderComponent($$result, "CodeBlock", $$CodeBlock, { "filename": "terminal", "code": deployCode })} <p class="mt-3 text-center text-xs text-gray-600">
Deploy on Railway or Docker. <a href="/docs/guides/hub/" class="text-gray-500 hover:text-indigo-400 underline decoration-gray-700 hover:decoration-indigo-400">Read the Hub setup guide.</a> </p> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/Hubs.astro", void 0);

const $$HumaneByDesign = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section id="humane" class="py-24 lg:py-32"> <div class="mx-auto max-w-4xl px-6"> <div class="animate-on-scroll rounded-2xl border border-border bg-surface/30 dark:bg-surface/50 p-8 sm:p-10 text-center"> <h2 class="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Built to be left.</h2> <p class="mx-auto mt-3 max-w-2xl text-gray-500 dark:text-gray-400">
xNet keeps no behavioral surplus and has no ad model — you are not the product.
        Six commitments hold us to it, several enforced by a CI gate that fails the build
        on regression.
</p> <ul class="mx-auto mt-8 grid max-w-2xl gap-x-8 gap-y-3 text-left sm:grid-cols-2"> ${commitments.map((c) => renderTemplate`<li class="flex items-baseline gap-2.5 text-sm"> <span class="font-semibold text-indigo-600 dark:text-indigo-400">${c.name}</span> <span class="text-gray-500 dark:text-gray-400">${c.promise}</span> </li>`)} </ul> <div class="mt-9 flex flex-wrap justify-center gap-4"> <a href="/commitments" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Our commitments
</a> <a href="/why" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-indigo-500/50 hover:bg-surface dark:text-gray-200">
Why this matters
</a> </div> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/HumaneByDesign.astro", void 0);

const $$TheVision = createComponent(($$result, $$props, $$slots) => {
  const enables = [
    {
      title: "Apps that work together",
      description: "Shared contacts, unified search, data that flows between tools.",
      icon: "connect"
    },
    {
      title: "Data portability",
      description: "Export everything, anytime. Your data, your format, your choice.",
      icon: "export"
    },
    {
      title: "Community schemas",
      description: "Like npm for data types. Share and reuse data structures.",
      icon: "community"
    },
    {
      title: "Decentralized social",
      description: "Follows, feeds, comments \u2014 without a platform in the middle.",
      icon: "social"
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section id="vision" class="py-24 lg:py-32 border-t border-border/50"> <div class="mx-auto max-w-6xl px-6"> <div class="max-w-3xl mx-auto text-center mb-16"> <h2 class="text-3xl font-bold text-gray-800 dark:text-white sm:text-4xl mb-6">
The Vision
</h2> <p class="text-xl text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
Imagine if all your apps could share data.
</p> <p class="text-gray-500 dark:text-gray-400 leading-relaxed">
Your task manager, your notes, your calendar, your CRM —
        all using the same underlying data layer. Offline. Private. Yours.
</p> </div> <div class="max-w-3xl mx-auto"> <div class="rounded-xl border border-purple-500/20 bg-purple-500/[0.03] p-8"> <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
Tesla built Warp — their own ERP connecting every bolt, every person, every decision.
          Love them or hate them, it's why they're the most vertically integrated company on the planet.
<strong class="text-purple-400">They own their nervous system and can adapt it as needed. We don't own ours.</strong> </p> <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
Beneath every forest, a mycelial network connects the trees — sharing water, nutrients, signals.
          Data should work like soil: an open foundation that lets everything grow.
</p> <p class="text-gray-500 dark:text-gray-400 text-sm">
xNet is an open protocol for local-first apps where data flows freely between devices, users, and applications.
          Not blockchain. Not Web3. Just good architecture that puts you in control.
</p> </div> </div> <div class="mt-12"> <h3 class="text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-8">
What this enables
</h3> <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"> ${enables.map((item) => renderTemplate`<div class="animate-on-scroll rounded-lg border border-border bg-surface/30 dark:bg-surface/50 p-5 text-center transition-all hover:border-purple-500/30"> <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400"> ${item.icon === "connect" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path> </svg>`} ${item.icon === "export" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path> </svg>`} ${item.icon === "community" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path> </svg>`} ${item.icon === "social" && renderTemplate`<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path> </svg>`} </div> <h4 class="font-semibold text-gray-700 dark:text-gray-200 mb-1">${item.title}</h4> <p class="text-xs text-gray-500 dark:text-gray-400">${item.description}</p> </div>`)} </div> </div> <p class="mt-12 text-center text-gray-500 dark:text-gray-400">
This is a long-term vision. Today, start with the app or SDK.
      Tomorrow, join the ecosystem.
</p> <div class="mt-6 flex justify-center"> <a href="#roadmap" class="inline-flex items-center gap-2 text-sm font-medium text-purple-500 hover:text-purple-400 transition-colors">
Read the Roadmap
<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path> </svg> </a> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/TheVision.astro", void 0);

const $$Landscape = createComponent(($$result, $$props, $$slots) => {
  const comparisons = [
    { feature: "Data location", traditional: "Cloud servers", xnet: "Your device", xnetHighlight: true },
    { feature: "Offline support", traditional: "Limited or none", xnet: "Full functionality", xnetHighlight: true },
    { feature: "Real-time sync", traditional: "Requires backend", xnet: "Built-in P2P", xnetHighlight: true },
    { feature: "Backend required", traditional: "Yes (deploy & maintain)", xnet: "No", xnetHighlight: true },
    { feature: "Vendor lock-in", traditional: "High", xnet: "None \u2014 open source", xnetHighlight: true }
  ];
  return renderTemplate`${maybeRenderHead()}<section id="landscape" class="py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "Why local-first?", "subtitle": "Traditional apps store your data in the cloud. xNet keeps it on your device.", "align": "center" })} <!-- Compact comparison table --> <div class="mt-12 max-w-3xl mx-auto animate-on-scroll"> <div class="overflow-hidden rounded-xl border border-border"> <table class="w-full text-sm"> <thead> <tr class="border-b border-border bg-surface/30 dark:bg-surface/50"> <th class="px-6 py-4 text-left font-medium text-gray-500"></th> <th class="px-6 py-4 text-center font-medium text-gray-500">Traditional</th> <th class="px-6 py-4 text-center font-semibold text-indigo-400">xNet</th> </tr> </thead> <tbody> ${comparisons.map((row, i) => renderTemplate`<tr${addAttribute(`border-b border-border/50 ${i % 2 === 0 ? "bg-surface/10" : ""}`, "class")}> <td class="px-6 py-4 text-gray-600 dark:text-gray-300 font-medium">${row.feature}</td> <td class="px-6 py-4 text-center text-gray-500">${row.traditional}</td> <td${addAttribute(`px-6 py-4 text-center ${row.xnetHighlight ? "text-emerald-400 font-medium" : "text-gray-400"}`, "class")}> ${row.xnet} </td> </tr>`)} </tbody> </table> </div> </div> <!-- Explore more link --> <div class="mt-8 text-center animate-on-scroll"> <a href="/compare" class="inline-flex items-center gap-2 text-sm font-medium text-indigo-500 hover:text-indigo-400 transition-colors">
See the full landscape: ${rowCount} projects compared, ${chipCount} more acknowledged
<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path> </svg> </a> </div> <!-- Quick alternatives callout --> <div class="mt-12 max-w-2xl mx-auto animate-on-scroll"> <div class="rounded-xl border border-border bg-surface/30 dark:bg-surface/50 p-6 text-center"> <p class="text-sm text-gray-500 dark:text-gray-400">
We're not the only ones building toward this vision.
          Check out <a href="https://anytype.io" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline">Anytype</a>,
<a href="https://jazz.tools" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline">Jazz</a>,
<a href="https://dxos.org" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline">DXOS</a>,
          and <a href="/compare" class="text-indigo-400 hover:underline">many more</a>.
</p> </div> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/Landscape.astro", void 0);

const siteMetrics = {
  packages: 47,
  tests: 9600,
  devtoolsPanels: 21};
const nf = new Intl.NumberFormat("en-US");
const testsLabel = `${nf.format(siteMetrics.tests)}+ tests`;
const packagesLabel = `${siteMetrics.packages} packages`;
const devtoolsLabel = `${siteMetrics.devtoolsPanels}-panel devtools suite`;
const testsAcrossPackages = `${testsLabel} across ${packagesLabel}`;

const updated = "June 2026";
const phases = [
  {
    status: "done",
    label: "Built",
    color: "emerald",
    title: "The Foundation",
    description: "Core primitives for local-first apps — and an app you can live in",
    items: [
      "Hybrid post-quantum crypto (ML-DSA-65, NIST FIPS 204)",
      "Crypto identity (DID:key, Ed25519, UCAN) with passkey sign-in",
      "Schema system with 15 property types",
      "P2P sync engine (Yjs + Lamport clocks)",
      "Encryption-first authorization (roles, grants, key recovery)",
      "Workbench shell — tabs, panels, command palette, zen mode",
      "Documents, databases, infinite canvas & task manager",
      "Dashboards with pluggable, sandboxed widgets & charts",
      "Real-time chat, presence & peer-to-peer calls",
      "Notification inbox with mentions & triage",
      "AI assistant — GraphRAG retrieval, on-device vectors & model switching",
      "Domain apps — CRM, finance ledger, experiments, maps & labs",
      "Framework-agnostic runtime + bring-your-own-server kit",
      "Connectors — GitHub, Notion, Airtable, Linear, Slack & RSS",
      "Agent surface — xnet CLI, SKILL.md, files-first checkout",
      "Humane charter — Right-to-Leave, consent panel & calm defaults",
      "Hub — encrypted backup, relay & full-text search",
      testsAcrossPackages
    ]
  },
  {
    status: "now",
    label: "Now",
    color: "amber",
    title: "Daily Driver",
    description: "Make xNet an app you actually use every day",
    items: [
      "Polished desktop experience",
      "Workspace invites & sharing flows",
      "Sharing UI (useCan / useGrants in app)",
      "Managed hub hosting — xNet Cloud (live in staging; signup, pricing, connect-your-hub)",
      "Push notification delivery (Web Push, Electron, mobile)",
      "Query API improvements"
    ]
  },
  {
    status: "next",
    label: "Next",
    color: "indigo",
    title: "Multiplayer at Scale",
    description: "Bigger teams, bigger calls, more devices",
    items: [
      "Mobile app (Expo)",
      "SFU tier for larger calls",
      "End-to-end encrypted channels",
      "Hub key registry & device directory"
    ]
  },
  {
    status: "future",
    label: "Then",
    color: "purple",
    title: "Federation",
    description: "Hubs talk to each other. Data flows freely.",
    items: [
      "Hub-to-hub federation protocol",
      "Federated queries across hubs",
      "Schema registry & discovery",
      "ERP framework & domain modules"
    ]
  },
  {
    status: "vision",
    label: "Vision",
    color: "pink",
    title: "The Decentralized Data Layer",
    description: "A global namespace for structured knowledge",
    items: [
      "Global namespace — xnet://*",
      "Decentralized search engine",
      "Social federation (follows, feeds, reputation)",
      "Domain-specific networks (farming, science, education)",
      "Data commons — humanity's shared knowledge graph"
    ]
  }
];

const $$Roadmap = createComponent(($$result, $$props, $$slots) => {
  const colorMap = {
    emerald: {
      dot: "bg-emerald-400",
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/[0.04]",
      label: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      line: "from-emerald-500/50"
    },
    amber: {
      dot: "bg-amber-400 animate-pulse",
      border: "border-amber-500/30",
      bg: "bg-amber-500/[0.04]",
      label: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      line: "from-amber-500/50"
    },
    indigo: {
      dot: "bg-indigo-400",
      border: "border-indigo-500/30",
      bg: "bg-indigo-500/[0.04]",
      label: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
      line: "from-indigo-500/50"
    },
    purple: {
      dot: "bg-purple-400",
      border: "border-purple-500/30",
      bg: "bg-purple-500/[0.04]",
      label: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
      line: "from-purple-500/50"
    },
    pink: {
      dot: "bg-pink-400",
      border: "border-pink-500/30",
      bg: "bg-pink-500/[0.04]",
      label: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
      line: "from-pink-500/50"
    }
  };
  return renderTemplate`${maybeRenderHead()}<section id="roadmap" class="py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "Where this is going", "subtitle": "From local-first primitives to the decentralized data layer of the internet. Each layer builds on the last.", "align": "center" })} <!-- Timeline --> <div class="relative mt-16 mx-auto max-w-3xl"> <!-- Vertical line --> <div class="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500/50 via-indigo-500/30 to-pink-500/20 sm:left-8"></div> <div class="space-y-6"> ${phases.map((phase, i) => {
    const colors = colorMap[phase.color];
    return renderTemplate`<div class="animate-on-scroll relative pl-16 sm:pl-20"> <!-- Dot on the timeline --> <div${addAttribute(`absolute left-[19px] top-6 h-[11px] w-[11px] rounded-full ${colors.dot} ring-[3px] ring-white dark:ring-[#0a0a0f] sm:left-[27px]`, "class")}></div> <!-- Card --> <div${addAttribute(`rounded-xl border ${colors.border} ${colors.bg} p-5 sm:p-6`, "class")}> <div class="flex flex-wrap items-center gap-2 mb-2"> <span${addAttribute(`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${colors.label}`, "class")}> ${phase.label} </span> <h3 class="text-lg font-bold text-gray-900 dark:text-white">${phase.title}</h3> </div> <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">${phase.description}</p> <ul class="grid gap-1.5 sm:grid-cols-2"> ${phase.items.map((item) => renderTemplate`<li class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"> ${phase.status === "done" ? renderTemplate`<svg class="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>` : renderTemplate`<span${addAttribute(`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${colors.dot.replace(" animate-pulse", "")}`, "class")}></span>`} <span>${item}</span> </li>`)} </ul> </div> </div>`;
  })} </div> <!-- End flourish --> <div class="mt-8 flex flex-col items-center justify-center gap-2"> <div class="rounded-full border border-pink-500/20 bg-pink-500/[0.04] px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
Every app built on xNet makes the network stronger
</div> <p class="text-xs text-gray-400 dark:text-gray-500">Updated ${updated}</p> </div> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/Roadmap.astro", void 0);

const $$Community = createComponent(($$result, $$props, $$slots) => {
  const stats = [
    { value: `${siteMetrics.packages}`, label: "packages" },
    { value: `${siteMetrics.tests.toLocaleString("en-US")}+`, label: "tests" },
    { value: `${siteMetrics.devtoolsPanels}`, label: "devtools panels" },
    { value: "MIT", label: "open source" }
  ];
  const working = [
    `${testsAcrossPackages} passing`,
    "Web + Electron apps with full P2P sync",
    "Workbench shell with tabs & command palette",
    "Schema system with 15 property types",
    "Real-time collaboration via Yjs",
    "Chat, presence & peer-to-peer calls",
    "Dashboards with sandboxed custom widgets",
    "A built-in AI assistant grounded in your graph",
    "Cryptographic identity with passkey sign-in",
    "Agent surface: xnet CLI, SKILL.md & MCP",
    devtoolsLabel
  ];
  return renderTemplate`${maybeRenderHead()}<section id="community" class="py-24 lg:py-32"> <div class="mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "This is early. That's the point.", "subtitle": "xNet is pre-release software. The APIs will change. There are rough edges. But the foundation is solid \u2014 and your contributions will shape what it becomes.", "align": "center" })} <!-- By the numbers — honest, build-verified scale (see /open) --> <div class="mx-auto mt-12 max-w-3xl"> <div class="grid grid-cols-2 gap-4 sm:grid-cols-4"> ${stats.map((s) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-border bg-surface/30 dark:bg-surface/50 px-4 py-5 text-center"> <div class="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">${s.value}</div> <div class="mt-1 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">${s.label}</div> </div>`)} </div> <p class="mt-4 text-center text-sm"> <a href="/open" class="text-indigo-600 dark:text-indigo-400 underline decoration-dotted underline-offset-2 hover:text-indigo-500">
See the open metrics →
</a> </p> </div> <!-- What's working now --> <div class="mx-auto mt-16 max-w-3xl"> <div class="animate-on-scroll rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6 sm:p-8"> <h3 class="font-semibold text-emerald-400 mb-4">What's working now</h3> <div class="grid gap-3 sm:grid-cols-2"> ${working.map((item) => renderTemplate`<div class="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400"> <svg class="h-4 w-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> ${item} </div>`)} </div> </div> </div> <!-- How to contribute --> <div class="mx-auto mt-8 max-w-3xl"> <div class="animate-on-scroll rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] p-6 sm:p-8"> <h3 class="font-semibold text-indigo-400 mb-4">We're looking for developers who want to</h3> <div class="space-y-3"> <div class="flex items-start gap-3 text-sm text-gray-500 dark:text-gray-400"> <span class="text-indigo-400 mt-0.5 shrink-0">&#10140;</span> <span><strong class="text-gray-700 dark:text-gray-300">Shape the API</strong> before it's set in stone &mdash; your feedback directly impacts the design</span> </div> <div class="flex items-start gap-3 text-sm text-gray-500 dark:text-gray-400"> <span class="text-indigo-400 mt-0.5 shrink-0">&#10140;</span> <span><strong class="text-gray-700 dark:text-gray-300">Build plugins</strong> for an extensible ecosystem &mdash; custom views, schemas, and integrations</span> </div> <div class="flex items-start gap-3 text-sm text-gray-500 dark:text-gray-400"> <span class="text-indigo-400 mt-0.5 shrink-0">&#10140;</span> <span><strong class="text-gray-700 dark:text-gray-300">Contribute to core</strong> &mdash; sync engine, query system, canvas, editor, devtools</span> </div> <div class="flex items-start gap-3 text-sm text-gray-500 dark:text-gray-400"> <span class="text-indigo-400 mt-0.5 shrink-0">&#10140;</span> <span><strong class="text-gray-700 dark:text-gray-300">Build apps</strong> on xNet and push the boundaries of local-first software</span> </div> </div> </div> </div> <!-- CTAs --> <div class="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"> <a href="https://github.com/crs48/xNet" class="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 transition-all"> <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path></svg>
Browse on GitHub
</a> <a href="https://github.com/crs48/xNet/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22" class="rounded-lg border border-border px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all">
Good First Issues
</a> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/Community.astro", void 0);

const $$GetStarted = createComponent(($$result, $$props, $$slots) => {
  const dim = (s) => `<span class="tok-comment">${s}</span>`;
  const installCode = `${dim("$")} pnpm add @xnetjs/react @xnetjs/data`;
  return renderTemplate`${maybeRenderHead()}<section id="get-started" class="relative border-t border-border/50 bg-surface/10 dark:bg-surface/20 py-24 lg:py-32"> <!-- Subtle glow --> <div class="absolute left-1/2 bottom-0 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-indigo-500/[0.05] blur-[120px]"></div> <div class="relative mx-auto max-w-6xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "Get Started", "subtitle": "Choose your path", "align": "center" })} <!-- Three paths --> <div class="mt-12 grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto"> <!-- Use the App --> <div class="animate-on-scroll rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6 text-center"> <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"> <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"></path> </svg> </div> <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Use the App</h3> <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
Try xNet as a productivity tool
</p> <div class="space-y-3"> <a href="/app" class="block w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
Try in Browser
</a> <a href="/download" class="block w-full rounded-lg border border-emerald-500/30 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
Download Desktop
</a> </div> <p class="mt-4 text-xs text-gray-500">No install needed. Works offline.</p> </div> <!-- Build with xNet --> <div class="animate-on-scroll rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] p-6 text-center"> <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400"> <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path> </svg> </div> <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Build with xNet</h3> <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
Add local-first superpowers to your React app
</p> <div class="mb-4"> ${renderComponent($$result, "CodeBlock", $$CodeBlock, { "filename": "terminal", "code": installCode })} </div> <div class="space-y-3"> <a href="/docs/quickstart/" class="block w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
Read the Docs
</a> <a href="https://github.com/crs48/xNet" class="block w-full rounded-lg border border-indigo-500/30 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors">
View on GitHub
</a> </div> </div> <!-- Join the Movement --> <div class="animate-on-scroll rounded-xl border border-purple-500/20 bg-purple-500/[0.03] p-6 text-center"> <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400"> <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path> </svg> </div> <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Join the Movement</h3> <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
Contribute to the open protocol
</p> <div class="space-y-3"> <a href="https://github.com/crs48/xNet/stargazers" class="flex items-center justify-center gap-2 w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors"> <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 19.771l-7.416 3.642 1.48-8.279L0 9.306l8.332-1.151z"></path></svg>
Star on GitHub
</a> <a href="https://github.com/crs48/xNet/discussions" class="block w-full rounded-lg border border-purple-500/30 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors">
Join GitHub Discussions
</a> </div> <p class="mt-4 text-xs text-gray-500">Good first issues waiting for you.</p> </div> </div> <p class="mt-8 text-center text-sm text-gray-500">
Requires Node.js 22+ and pnpm for development.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/GetStarted.astro", void 0);

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet \u2014 Your data. Your devices. Your rules.", "description": "xNet is a local-first platform for apps that work offline, sync peer-to-peer, and keep your data under your control. Build from any framework with your own backend, or try the productivity app." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "Hero", $$Hero, {})} ${renderComponent($$result2, "WhatIsXNet", $$WhatIsXNet, {})} ${renderComponent($$result2, "TheApp", $$TheApp, {})} ${renderComponent($$result2, "BuiltWithAI", $$BuiltWithAI, {})} ${renderComponent($$result2, "ForDevelopers", $$ForDevelopers, {})} ${renderComponent($$result2, "BuiltForAgents", $$BuiltForAgents, {})} ${renderComponent($$result2, "Integrations", $$Integrations, {})} ${renderComponent($$result2, "UnderTheHood", $$UnderTheHood, {})} ${renderComponent($$result2, "OpenProtocol", $$OpenProtocol, {})} ${renderComponent($$result2, "Hubs", $$Hubs, {})} ${renderComponent($$result2, "HumaneByDesign", $$HumaneByDesign, {})} ${renderComponent($$result2, "TheVision", $$TheVision, {})} ${renderComponent($$result2, "Landscape", $$Landscape, {})} ${renderComponent($$result2, "Roadmap", $$Roadmap, {})} ${renderComponent($$result2, "Community", $$Community, {})} ${renderComponent($$result2, "GetStarted", $$GetStarted, {})} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/index.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
