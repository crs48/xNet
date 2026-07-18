import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate, f as renderComponent } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { r as rowCount, c as chipCount, l as layers, u as updated } from '../chunks/compare_gKySB9Il.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro$2 = createAstro("https://xnet.fyi");
const $$CompareCell = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$CompareCell;
  const { value, footnotes, anchor } = Astro2.props;
  const raw = typeof value === "object" ? value.v : value;
  const fn = typeof value === "object" ? value.fn : void 0;
  const fnIndex = fn ? footnotes.findIndex((f) => f.id === fn) + 1 : 0;
  const ternary = {
    yes: { label: "\u2713 Yes", tone: "text-emerald-600 dark:text-emerald-400" },
    partial: { label: "\u25D0 Partial", tone: "text-amber-600 dark:text-amber-400" },
    no: { label: "\u2717 No", tone: "text-gray-400 dark:text-gray-600" }
  };
  const t = ternary[raw];
  const tone = t ? t.tone : raw === "\u2014" ? "text-gray-400 dark:text-gray-600" : "text-gray-500 dark:text-gray-400";
  return renderTemplate`${maybeRenderHead()}<span${addAttribute(tone, "class")}> ${t ? t.label : raw}${fnIndex > 0 && renderTemplate`<a${addAttribute(`#${anchor}-fn-${fnIndex}`, "href")} class="align-super text-[10px] text-indigo-400 hover:underline"> ${fnIndex} </a>`} </span>`;
}, "/home/runner/work/xNet/xNet/site/src/components/compare/CompareCell.astro", void 0);

const $$Astro$1 = createAstro("https://xnet.fyi");
const $$MaturityBadge = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$MaturityBadge;
  const { maturity } = Astro2.props;
  const tones = {
    production: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    beta: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    alpha: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    "pre-release": "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    maintenance: "border-gray-500/30 bg-gray-500/10 text-gray-500 dark:text-gray-400"
  };
  return renderTemplate`${maybeRenderHead()}<span${addAttribute(`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[maturity]}`, "class")}> ${maturity} </span>`;
}, "/home/runner/work/xNet/xNet/site/src/components/compare/MaturityBadge.astro", void 0);

const $$Astro = createAstro("https://xnet.fyi");
const $$CompareLayerSection = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CompareLayerSection;
  const { layer } = Astro2.props;
  const resolve = (p, key) => key === "license" ? p.license : key === "bestFor" ? p.bestFor : p.dims[key];
  const fnIndex = (id) => layer.footnotes.findIndex((f) => f.id === id) + 1;
  const detailKeys = [];
  for (const p of layer.projects) {
    for (const k of Object.keys(p.details ?? {})) {
      if (!detailKeys.includes(k)) detailKeys.push(k);
    }
  }
  const bestForInColumns = layer.columns.some((c) => c.key === "bestFor");
  const hasExtended = detailKeys.length > 0 || !bestForInColumns;
  const wrapClass = (key) => key === "bestFor" ? "min-w-[18rem]" : "whitespace-nowrap";
  return renderTemplate`${maybeRenderHead()}<section${addAttribute(layer.id, "id")} class="mb-24 scroll-mt-36"> <div class="mb-4 flex flex-wrap items-center gap-3"> <h2 class="text-2xl font-bold text-gray-800 dark:text-white">${layer.title}</h2> <span class="rounded-full border border-border px-2.5 py-0.5 text-xs text-gray-500">
Last verified: ${layer.lastVerified} </span> </div> <p class="mb-4 max-w-3xl text-gray-500 dark:text-gray-400">${layer.intro}</p> ${layer.xnetNote && renderTemplate`<p class="mb-6 max-w-3xl rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] px-4 py-3 text-sm text-gray-600 dark:text-gray-300"> ${layer.xnetNote} </p>`} <!-- Desktop: full table in a keyboard-focusable scroll region --> <div class="hidden sm:block overflow-x-auto rounded-xl border border-border" role="region"${addAttribute(`${layer.id}-caption`, "aria-labelledby")} tabindex="0"> <table class="w-full text-sm"> <caption${addAttribute(`${layer.id}-caption`, "id")} class="sr-only">${layer.title} comparison</caption> <thead> <tr class="border-b border-border bg-surface/30 dark:bg-surface/50"> <th scope="col" class="sticky left-0 z-10 min-w-[120px] bg-surface/80 px-4 py-3 text-left font-semibold text-gray-600 backdrop-blur-sm dark:bg-surface/90 dark:text-gray-300">
Project
</th> <th scope="col" class="whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500">Maturity</th> ${layer.columns.map((col) => renderTemplate`<th scope="col" class="whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500"> ${col.label} </th>`)} </tr> </thead> <tbody> ${layer.projects.map((p) => renderTemplate`<tr${addAttribute(`border-b border-border/50 ${p.highlight ? "bg-indigo-500/[0.04]" : "hover:bg-surface/30"} transition-colors`, "class")}> <th scope="row"${addAttribute(`sticky left-0 z-10 ${p.highlight ? "bg-indigo-500/[0.06]" : "bg-code-bg"} whitespace-nowrap px-4 py-3 text-left font-medium backdrop-blur-sm`, "class")}> <a${addAttribute(p.url, "href")} target="_blank" rel="noopener noreferrer"${addAttribute(`hover:underline ${p.highlight ? "text-indigo-400" : "text-gray-600 hover:text-indigo-400 dark:text-gray-300"}`, "class")}> ${p.name} </a> ${(p.footnotes ?? []).map((id) => renderTemplate`<a${addAttribute(`#${layer.id}-fn-${fnIndex(id)}`, "href")} class="ml-0.5 align-super text-[10px] text-indigo-400 hover:underline"> ${fnIndex(id)} </a>`)} </th> <td class="whitespace-nowrap px-4 py-3"> ${renderComponent($$result, "MaturityBadge", $$MaturityBadge, { "maturity": p.maturity })} </td> ${layer.columns.map((col) => renderTemplate`<td${addAttribute(`px-4 py-3 ${wrapClass(col.key)}`, "class")}> ${renderComponent($$result, "CompareCell", $$CompareCell, { "value": resolve(p, col.key), "footnotes": layer.footnotes, "anchor": layer.id })} </td>`)} </tr>`)} </tbody> </table> </div> <!-- Desktop: extended dimensions, collapsed by default --> ${hasExtended && renderTemplate`<details class="mt-3 hidden sm:block"> <summary class="cursor-pointer select-none text-sm text-gray-500 transition-colors hover:text-indigo-400">
More dimensions: ${[...bestForInColumns ? [] : ["Best for"], ...detailKeys].join(" \xB7 ")} </summary> <div class="mt-3 overflow-x-auto rounded-xl border border-border" role="region"${addAttribute(`${layer.title} extended dimensions`, "aria-label")} tabindex="0"> <table class="w-full text-sm"> <caption class="sr-only">${layer.title} extended dimensions</caption> <thead> <tr class="border-b border-border bg-surface/30 dark:bg-surface/50"> <th scope="col" class="sticky left-0 z-10 min-w-[120px] bg-surface/80 px-4 py-3 text-left font-semibold text-gray-600 backdrop-blur-sm dark:bg-surface/90 dark:text-gray-300">
Project
</th> ${!bestForInColumns && renderTemplate`<th scope="col" class="whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500">
Best for
</th>`} ${detailKeys.map((k) => renderTemplate`<th scope="col" class="whitespace-nowrap px-4 py-3 text-left font-medium text-gray-500"> ${k} </th>`)} </tr> </thead> <tbody> ${layer.projects.map((p) => renderTemplate`<tr${addAttribute(`border-b border-border/50 ${p.highlight ? "bg-indigo-500/[0.04]" : "hover:bg-surface/30"} transition-colors`, "class")}> <th scope="row"${addAttribute(`sticky left-0 z-10 ${p.highlight ? "bg-indigo-500/[0.06]" : "bg-code-bg"} whitespace-nowrap px-4 py-3 text-left font-medium backdrop-blur-sm`, "class")}> <a${addAttribute(p.url, "href")} target="_blank" rel="noopener noreferrer"${addAttribute(`hover:underline ${p.highlight ? "text-indigo-400" : "text-gray-600 hover:text-indigo-400 dark:text-gray-300"}`, "class")}> ${p.name} </a> </th> ${!bestForInColumns && renderTemplate`<td class="min-w-[18rem] px-4 py-3 text-gray-500 dark:text-gray-400">${p.bestFor}</td>`} ${detailKeys.map((k) => renderTemplate`<td class="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400"> ${p.details?.[k] ?? "\u2014"} </td>`)} </tr>`)} </tbody> </table> </div> </details>`} <!-- Mobile: one expandable card per project --> <div class="space-y-3 sm:hidden"> ${layer.projects.map((p) => renderTemplate`<details${addAttribute(`rounded-xl border px-4 py-3 ${p.highlight ? "border-indigo-500/30 bg-indigo-500/[0.04]" : "border-border bg-surface/20"}`, "class")}> <summary class="flex cursor-pointer select-none items-center justify-between gap-2"> <span${addAttribute(`font-medium ${p.highlight ? "text-indigo-400" : "text-gray-700 dark:text-gray-200"}`, "class")}> ${p.name} ${(p.footnotes ?? []).map((id) => renderTemplate`<a${addAttribute(`#${layer.id}-fn-${fnIndex(id)}`, "href")} class="ml-0.5 align-super text-[10px] text-indigo-400"> ${fnIndex(id)} </a>`)} </span> ${renderComponent($$result, "MaturityBadge", $$MaturityBadge, { "maturity": p.maturity })} </summary> <dl class="mt-3 space-y-1.5 text-sm"> ${layer.columns.map((col) => renderTemplate`<div class="flex justify-between gap-4"> <dt class="shrink-0 text-gray-500">${col.label}</dt> <dd class="text-right"> ${renderComponent($$result, "CompareCell", $$CompareCell, { "value": resolve(p, col.key), "footnotes": layer.footnotes, "anchor": layer.id })} </dd> </div>`)} ${!bestForInColumns && renderTemplate`<div class="flex justify-between gap-4"> <dt class="shrink-0 text-gray-500">Best for</dt> <dd class="text-right text-gray-500 dark:text-gray-400">${p.bestFor}</dd> </div>`} ${detailKeys.map(
    (k) => p.details?.[k] && renderTemplate`<div class="flex justify-between gap-4"> <dt class="shrink-0 text-gray-500">${k}</dt> <dd class="text-right text-gray-500 dark:text-gray-400">${p.details[k]}</dd> </div>`
  )} <div class="pt-1"> <a${addAttribute(p.url, "href")} target="_blank" rel="noopener noreferrer" class="text-xs text-indigo-400 hover:underline">
Visit site →
</a> </div> </dl> </details>`)} </div> <!-- Long tail --> ${layer.chips.length > 0 && renderTemplate`<div class="mt-6"> <h3 class="mb-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Worth knowing</h3> <div class="flex flex-wrap gap-2"> ${layer.chips.map((c) => renderTemplate`<a${addAttribute(c.url, "href")} target="_blank" rel="noopener noreferrer" class="group inline-flex max-w-full items-baseline gap-1.5 rounded-full border border-border bg-surface/30 px-3 py-1.5 text-xs transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/[0.06]"> <span class="font-medium text-gray-600 group-hover:text-indigo-400 dark:text-gray-300">${c.name}</span> <span class="text-gray-500">· ${c.note}</span> </a>`)} </div> </div>`} <!-- Footnotes --> ${layer.footnotes.length > 0 && renderTemplate`<ol class="mt-4 max-w-3xl list-none space-y-1 text-xs text-gray-500"> ${layer.footnotes.map((f, i) => renderTemplate`<li${addAttribute(`${layer.id}-fn-${i + 1}`, "id")} class="scroll-mt-36"> <span class="text-indigo-400">${i + 1}.</span> ${f.text} ${f.sourceUrl && renderTemplate`<a${addAttribute(f.sourceUrl, "href")} target="_blank" rel="noopener noreferrer" class="ml-1 text-indigo-400 hover:underline">
source
</a>`} </li>`)} </ol>`} </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/compare/CompareLayerSection.astro", void 0);

const $$Compare = createComponent(($$result, $$props, $$slots) => {
  const editUrl = "https://github.com/crs48/xNet/blob/main/site/src/data/compare.ts";
  const guideCards = [
    {
      title: "Use a product today",
      color: "emerald",
      paths: [
        {
          need: "Personal knowledge",
          answer: "Obsidian, Logseq, Anytype \u2014 or the xNet App for typed nodes + canvas + databases + chat"
        },
        {
          need: "Team workspace",
          answer: "Notion, Airtable \u2014 or xNet if ownership matters more than SaaS maturity"
        },
        {
          need: "E2EE notes right now",
          answer: "Joplin, Notesnook, Standard Notes"
        }
      ]
    },
    {
      title: "Build an app",
      color: "indigo",
      paths: [
        {
          need: "Existing Postgres / SQL backend",
          answer: "Zero, Electric Sync, PowerSync \u2014 often via TanStack DB"
        },
        {
          need: "Greenfield TypeScript local-first",
          answer: "xNet, Jazz, LiveStore, Evolu"
        },
        {
          need: "AI agents / AI-coded apps",
          answer: "Electric Agents, InstantDB, Convex \u2014 or xNet for agent-readable, user-owned workspaces"
        }
      ]
    },
    {
      title: "Need a primitive",
      color: "purple",
      paths: [
        {
          need: "Collaborative documents",
          answer: "Yjs, Loro, Automerge"
        },
        {
          need: "P2P transport / content addressing",
          answer: "Iroh, libp2p, Hypercore, IPFS"
        },
        {
          need: "Federated social",
          answer: "AT Protocol, ActivityPub, Nostr"
        }
      ]
    }
  ];
  const guideColors = {
    emerald: { border: "border-emerald-500/20", bg: "bg-emerald-500/[0.03]", text: "text-emerald-500 dark:text-emerald-400" },
    indigo: { border: "border-indigo-500/20", bg: "bg-indigo-500/[0.03]", text: "text-indigo-500 dark:text-indigo-400" },
    purple: { border: "border-purple-500/20", bg: "bg-purple-500/[0.03]", text: "text-purple-500 dark:text-purple-400" }
  };
  const tradeoffs = [
    { need: "Mature SaaS workspace with enterprise support", fit: "Notion, Airtable, Linear" },
    { need: "Incremental sync onto an existing Postgres app", fit: "Zero, Electric Sync, PowerSync" },
    { need: "Agent infrastructure at cloud scale", fit: "Electric Agents, Cloudflare Agents, Convex" },
    { need: "Offline mesh across BLE / LAN in production", fit: "Ditto" },
    { need: "Just a rich-text CRDT", fit: "Yjs, Loro, Automerge" },
    { need: "E2EE standalone notes, today, on every device", fit: "Joplin, Notesnook, Standard Notes" },
    { need: "Federated social protocol", fit: "AT Protocol, ActivityPub, Nostr" }
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "How xNet Compares \u2014 The Local-First Landscape", "description": `The local-first landscape in five layers: ${rowCount} products, frameworks, sync engines, CRDT substrates, and protocols compared \u2014 plus ${chipCount} more worth knowing. Updated ${updated}.` }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="py-24 lg:py-32"> <div class="mx-auto max-w-7xl px-6"> <!-- Hero --> <div class="mb-10 text-center"> <h1 class="mb-6 text-4xl font-bold text-gray-800 dark:text-white sm:text-5xl">
The Local-First Landscape
</h1> <p class="mx-auto max-w-2xl text-lg leading-relaxed text-gray-500 dark:text-gray-400">
We're building xNet because we believe users should own their data.
          We're not alone — here are the projects pushing this vision forward, compared layer by layer.
          We encourage you to explore them all.
</p> </div> <!-- Methodology / trust --> <div class="mx-auto mb-10 max-w-3xl rounded-xl border border-border bg-surface/30 p-5 text-sm text-gray-500 dark:text-gray-400"> <p> <strong class="text-gray-600 dark:text-gray-300">How to read this page.</strong>
Projects are grouped by layer: some compete with xNet directly, others are building blocks
          it uses, or mature products it learns from. We maintain this comparison ourselves, so treat
          it as informed but opinionated. Status claims are footnoted with sources, and every section
          shows when it was last verified.
</p> <p class="mt-2">
Spotted something stale or unfair?
<a${addAttribute(editUrl, "href")} target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline">Edit the data on GitHub</a>.
</p> <p class="mt-2">
xNet is an open protocol you can verify and re-implement —
<a href="/build-with" class="text-indigo-400 hover:underline">build with React, Swift, Rust, or any language →</a> </p> </div> <!-- Summary stats (derived from the data module) --> <div class="mx-auto mb-12 grid max-w-3xl gap-6 sm:grid-cols-3"> <div class="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] p-6 text-center"> <div class="mb-2 text-3xl font-bold text-indigo-400">${rowCount}</div> <div class="text-sm text-gray-500">Projects compared</div> </div> <div class="rounded-xl border border-purple-500/20 bg-purple-500/[0.03] p-6 text-center"> <div class="mb-2 text-3xl font-bold text-purple-400">${chipCount}</div> <div class="text-sm text-gray-500">More acknowledged</div> </div> <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6 text-center"> <div class="mb-2 text-3xl font-bold text-emerald-400">${layers.length}</div> <div class="text-sm text-gray-500">Layers</div> </div> </div> <!-- Section pills --> <nav aria-label="Comparison sections" class="sticky top-[60px] z-20 -mx-6 mb-16 border-b border-border/50 bg-white/80 px-6 py-3 backdrop-blur-xl dark:bg-[#0a0a0f]/80"> <div class="flex flex-wrap justify-center gap-2"> ${layers.map((l) => renderTemplate`<a${addAttribute(`#${l.id}`, "href")} class="rounded-full border border-border bg-surface/30 px-3.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-500/40 hover:text-indigo-400 dark:text-gray-300"> ${l.shortTitle} </a>`)} <a href="#guide" class="rounded-full border border-border bg-surface/30 px-3.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-500/40 hover:text-indigo-400 dark:text-gray-300">
Guide
</a> <a href="#fit" class="rounded-full border border-border bg-surface/30 px-3.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-500/40 hover:text-indigo-400 dark:text-gray-300">
Where xNet fits
</a> </div> </nav> <!-- Layer sections --> ${layers.map((layer) => renderTemplate`${renderComponent($$result2, "CompareLayerSection", $$CompareLayerSection, { "layer": layer })}`)} <!-- Decision guide --> <section id="guide" class="mb-24 scroll-mt-36"> <h2 class="mb-3 text-2xl font-bold text-gray-800 dark:text-white">What are you trying to do?</h2> <p class="mb-8 max-w-3xl text-gray-500 dark:text-gray-400">
A quick orientation. Every path below is a good choice for its job — including the ones
          that aren't xNet.
</p> <div class="grid gap-4 lg:grid-cols-3"> ${guideCards.map((card) => {
    const c = guideColors[card.color];
    return renderTemplate`<div${addAttribute(`rounded-xl border ${c.border} ${c.bg} p-6`, "class")}> <h3${addAttribute(`mb-4 text-sm font-semibold uppercase tracking-wide ${c.text}`, "class")}>${card.title}</h3> <dl class="space-y-4 text-sm"> ${card.paths.map((path) => renderTemplate`<div> <dt class="font-medium text-gray-700 dark:text-gray-200">${path.need}</dt> <dd class="mt-1 text-gray-500 dark:text-gray-400">${path.answer}</dd> </div>`)} </dl> </div>`;
  })} </div> </section> <!-- Honesty block --> <section class="mb-24"> <h2 class="mb-3 text-2xl font-bold text-gray-800 dark:text-white">
When the alternatives are the better choice
</h2> <p class="mb-8 max-w-3xl text-gray-500 dark:text-gray-400">
xNet is pre-release software combining several layers that are usually separate. If your
          need matches one of these, pick the specialist.
</p> <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"> ${tradeoffs.map((t) => renderTemplate`<div class="rounded-lg border border-border bg-surface/30 p-4 text-sm"> <p class="font-medium text-gray-700 dark:text-gray-200">${t.need}</p> <p class="mt-1 text-gray-500 dark:text-gray-400">${t.fit}</p> </div>`)} </div> </section> <!-- Where xNet fits --> <section id="fit" class="mx-auto max-w-4xl scroll-mt-36"> <div class="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] p-8 sm:p-10"> <h2 class="mb-4 text-center text-2xl font-bold text-gray-800 dark:text-white">Where xNet Fits</h2> <p class="mb-8 text-center leading-relaxed text-gray-500 dark:text-gray-400">
xNet combines <strong class="text-gray-600 dark:text-gray-300">TypeScript-inferred schemas</strong>,
            a <strong class="text-gray-600 dark:text-gray-300">dual CRDT strategy</strong> (Yjs for rich text + Lamport LWW for structured data),
<strong class="text-gray-600 dark:text-gray-300">React hooks</strong>,
<strong class="text-gray-600 dark:text-gray-300">P2P sync with an optional Hub</strong>,
            and an <strong class="text-gray-600 dark:text-gray-300">agent surface</strong> (xnet CLI + SKILL.md)
            — plus an app you can live in: documents, databases, canvas, tasks, chat, and calls.
</p> <div class="grid gap-4 text-sm sm:grid-cols-2"> <div class="rounded-lg border border-border bg-surface/30 p-4"> <p class="text-gray-500 dark:text-gray-400"> <strong class="text-indigo-400">Building a React app?</strong><br>
Want local-first with minimal boilerplate? Start here.
</p> </div> <div class="rounded-lg border border-border bg-surface/30 p-4"> <p class="text-gray-500 dark:text-gray-400"> <strong class="text-gray-600 dark:text-gray-300">Need a social protocol?</strong><br>
Check out <a href="https://atproto.com" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-400">AT Protocol</a> or
<a href="https://nostr.com" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-400">Nostr</a>.
</p> </div> <div class="rounded-lg border border-border bg-surface/30 p-4"> <p class="text-gray-500 dark:text-gray-400"> <strong class="text-gray-600 dark:text-gray-300">Need low-level P2P?</strong><br>
Check out <a href="https://iroh.computer" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-400">Iroh</a> or
<a href="https://pears.com" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-400">Hypercore</a>.
</p> </div> <div class="rounded-lg border border-border bg-surface/30 p-4"> <p class="text-gray-500 dark:text-gray-400"> <strong class="text-gray-600 dark:text-gray-300">Want a knowledge base today?</strong><br>
Check out <a href="https://anytype.io" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-400">Anytype</a> or
<a href="https://obsidian.md" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-400">Obsidian</a>.
</p> </div> </div> <div class="mt-8 flex justify-center gap-4"> <a href="/" class="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Back to Home
</a> <a href="/docs/quickstart/" class="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-6 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-300">
Get Started
</a> </div> </div> </section> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/compare.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/compare.astro";
const $$url = "/compare";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Compare,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
