import { a as createComponent, f as renderComponent, d as renderTemplate } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Common } from '../chunks/common_BZC4BwCM.mjs';
export { renderers } from '../renderers.mjs';

const prerender = true;
const $$404 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "CommonPage", $$Common, {})}`;
}, "/home/runner/work/xNet/xNet/site/node_modules/.pnpm/@astrojs+starlight@0.37.6_astro@5.16.15_jiti@1.21.7_rollup@4.56.0_tsx@4.21.0_typescript@5.9.3_yaml@2.8.2_/node_modules/@astrojs/starlight/routes/static/404.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/node_modules/.pnpm/@astrojs+starlight@0.37.6_astro@5.16.15_jiti@1.21.7_rollup@4.56.0_tsx@4.21.0_typescript@5.9.3_yaml@2.8.2_/node_modules/@astrojs/starlight/routes/static/404.astro";
const $$url = undefined;

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$404,
	file: $$file,
	prerender,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
