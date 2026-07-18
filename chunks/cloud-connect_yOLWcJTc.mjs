import { g as createVNode, F as Fragment, _ as __astro_tag_component__ } from './astro/server_CDqOe6mW.mjs';
import { d as $$Tabs, e as $$TabItem, b as $$Steps } from './Code_DejOdlcC.mjs';

const frontmatter = {
  "title": "Connect to xNet Cloud",
  "draft": false,
  "description": "Link your web, desktop, or mobile app to a managed xNet Cloud hub.",
  "sidebar": {
    "order": 8
  }
};
function getHeadings() {
  return [{
    "depth": 2,
    "slug": "two-identities-one-account",
    "text": "Two identities, one account"
  }, {
    "depth": 2,
    "slug": "connect-your-app",
    "text": "Connect your app"
  }, {
    "depth": 2,
    "slug": "what-the-device-code-is",
    "text": "What the device code is"
  }, {
    "depth": 2,
    "slug": "troubleshooting",
    "text": "Troubleshooting"
  }, {
    "depth": 2,
    "slug": "related",
    "text": "Related"
  }];
}
function _createMdxContent(props) {
  const _components = {
    aside: "aside",
    p: "p",
    ...props.components
  }, {Fragment: Fragment$1} = _components;
  if (!Fragment$1) _missingMdxReference("Fragment");
  return createVNode(Fragment, {
    children: [createVNode(Fragment$1, {
      "set:html": "<aside aria-label=\"You will learn\" class=\"starlight-aside starlight-aside--note\"><p class=\"starlight-aside__title\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"starlight-aside__icon\"><path d=\"M12 11C11.7348 11 11.4804 11.1054 11.2929 11.2929C11.1054 11.4804 11 11.7348 11 12V16C11 16.2652 11.1054 16.5196 11.2929 16.7071C11.4804 16.8946 11.7348 17 12 17C12.2652 17 12.5196 16.8946 12.7071 16.7071C12.8946 16.5196 13 16.2652 13 16V12C13 11.7348 12.8946 11.4804 12.7071 11.2929C12.5196 11.1054 12.2652 11 12 11ZM12.38 7.08C12.1365 6.97998 11.8635 6.97998 11.62 7.08C11.4973 7.12759 11.3851 7.19896 11.29 7.29C11.2017 7.3872 11.1306 7.49882 11.08 7.62C11.024 7.73868 10.9966 7.86882 11 8C10.9992 8.13161 11.0245 8.26207 11.0742 8.38391C11.124 8.50574 11.1973 8.61656 11.29 8.71C11.3872 8.79833 11.4988 8.86936 11.62 8.92C11.7715 8.98224 11.936 9.00632 12.099 8.99011C12.2619 8.97391 12.4184 8.91792 12.5547 8.82707C12.691 8.73622 12.8029 8.61328 12.8805 8.46907C12.9582 8.32486 12.9992 8.16378 13 8C12.9963 7.73523 12.8927 7.48163 12.71 7.29C12.6149 7.19896 12.5028 7.12759 12.38 7.08ZM12 2C10.0222 2 8.08879 2.58649 6.4443 3.6853C4.79981 4.78412 3.51809 6.3459 2.76121 8.17317C2.00433 10.0004 1.8063 12.0111 2.19215 13.9509C2.578 15.8907 3.53041 17.6725 4.92894 19.0711C6.32746 20.4696 8.10929 21.422 10.0491 21.8079C11.9889 22.1937 13.9996 21.9957 15.8268 21.2388C17.6541 20.4819 19.2159 19.2002 20.3147 17.5557C21.4135 15.9112 22 13.9778 22 12C22 10.6868 21.7413 9.38642 21.2388 8.17317C20.7363 6.95991 19.9997 5.85752 19.0711 4.92893C18.1425 4.00035 17.0401 3.26375 15.8268 2.7612C14.6136 2.25866 13.3132 2 12 2ZM12 20C10.4178 20 8.87104 19.5308 7.55544 18.6518C6.23985 17.7727 5.21447 16.5233 4.60897 15.0615C4.00347 13.5997 3.84504 11.9911 4.15372 10.4393C4.4624 8.88743 5.22433 7.46197 6.34315 6.34315C7.46197 5.22433 8.88743 4.4624 10.4393 4.15372C11.9911 3.84504 13.5997 4.00346 15.0615 4.60896C16.5233 5.21447 17.7727 6.23984 18.6518 7.55544C19.5308 8.87103 20 10.4177 20 12C20 14.1217 19.1572 16.1566 17.6569 17.6569C16.1566 19.1571 14.1217 20 12 20Z\"></path></svg>You will learn</p><div class=\"starlight-aside__content\"><ul>\n<li>How the two identities (billing vs. passkey) fit together</li>\n<li>How to connect the <strong>web</strong>, <strong>desktop</strong>, and <strong>mobile</strong> apps to your managed hub</li>\n<li>What the short device code is and how approval works</li>\n<li>How to troubleshoot a connection that won’t complete</li>\n</ul></div></aside>\n<p>After you subscribe at <a href=\"https://xnet.fyi/cloud\">xnet.fyi/cloud</a>, xNet Cloud\nprovisions a dedicated, always-on <strong>hub</strong> for your data. Your apps still hold the\nplaintext — the hub only ever stores encrypted updates and relays them between your\ndevices. This guide links an app to that hub.</p>\n<p>You can open the relevant steps any time from the <strong>Connect your apps</strong> card on your\n<a href=\"https://cloud.xnet.fyi/dashboard\">dashboard</a>.</p>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"two-identities-one-account\">Two identities, one account</h2><a class=\"sl-anchor-link\" href=\"#two-identities-one-account\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Two identities, one account”</span></a></div>\n<p>xNet keeps the <em>who pays</em> and <em>whose data</em> questions separate on purpose:</p>\n<ul>\n<li><strong>Billing identity</strong> — the email you sign in to the dashboard with. Custodial and\nrecoverable (a normal password/passkey reset).</li>\n<li><strong>Data identity (your passkey)</strong> — a <code dir=\"auto\">did:key</code> created <strong>on your device</strong> when you\nfirst open the app. Non-custodial: it never leaves the device, and it’s what proves\na device may read and write your data. We never see its private key.</li>\n</ul>\n<p>Connecting a device is the moment these two are bound together: you prove the billing\nside (you’re signed in to the dashboard) <strong>and</strong> the data side (your app holds the\npasskey) at the same time.</p>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"connect-your-app\">Connect your app</h2><a class=\"sl-anchor-link\" href=\"#connect-your-app\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Connect your app”</span></a></div>\n"
    }), createVNode($$Tabs, {
      children: [createVNode($$TabItem, {
        label: "Web",
        children: createVNode($$Steps, {
          "set:html": "<ol>\n<li>Open the <a href=\"https://xnet.fyi/app\">web app</a> (or click <strong>Open web app</strong> on your\ndashboard).</li>\n<li>When prompted, <strong>create your passkey</strong>. This is your data identity — it stays\non your device.</li>\n<li>Choose <strong>Connect xNet Cloud hub</strong>. The app shows a short code like\n<code dir=\"auto\">ABCD-7K2P</code>.</li>\n<li>On your dashboard, open <strong>Connect your apps → Enter a code</strong>, type the code,\nand approve. The app finishes connecting automatically.</li>\n</ol>"
        })
      }), createVNode($$TabItem, {
        label: "Desktop",
        children: [createVNode(_components.p, {
          children: "The desktop app connects to your hub by its URL."
        }), createVNode($$Steps, {
          "set:html": "<ol>\n<li>On your dashboard, copy your <strong>hub URL</strong> (the <strong>Connect your apps → Desktop</strong>\ntab, or the <strong>Endpoint</strong> row — it looks like <code dir=\"auto\">wss://…hub.xnet.fyi</code>).</li>\n<li>In the desktop app, open <strong>Settings → Network</strong> and paste it into the\n<strong>Signaling server</strong> field.</li>\n<li>Restart the app, then create your passkey and choose <strong>Connect xNet Cloud\nhub</strong>.</li>\n<li>Approve the short code it shows on your dashboard under <strong>Enter a code</strong>.</li>\n</ol>"
        }), createVNode(_components.aside, {
          "aria-label": "Note",
          class: "starlight-aside starlight-aside--note",
          "set:html": "<p class=\"starlight-aside__title\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"starlight-aside__icon\"><path d=\"M12 11C11.7348 11 11.4804 11.1054 11.2929 11.2929C11.1054 11.4804 11 11.7348 11 12V16C11 16.2652 11.1054 16.5196 11.2929 16.7071C11.4804 16.8946 11.7348 17 12 17C12.2652 17 12.5196 16.8946 12.7071 16.7071C12.8946 16.5196 13 16.2652 13 16V12C13 11.7348 12.8946 11.4804 12.7071 11.2929C12.5196 11.1054 12.2652 11 12 11ZM12.38 7.08C12.1365 6.97998 11.8635 6.97998 11.62 7.08C11.4973 7.12759 11.3851 7.19896 11.29 7.29C11.2017 7.3872 11.1306 7.49882 11.08 7.62C11.024 7.73868 10.9966 7.86882 11 8C10.9992 8.13161 11.0245 8.26207 11.0742 8.38391C11.124 8.50574 11.1973 8.61656 11.29 8.71C11.3872 8.79833 11.4988 8.86936 11.62 8.92C11.7715 8.98224 11.936 9.00632 12.099 8.99011C12.2619 8.97391 12.4184 8.91792 12.5547 8.82707C12.691 8.73622 12.8029 8.61328 12.8805 8.46907C12.9582 8.32486 12.9992 8.16378 13 8C12.9963 7.73523 12.8927 7.48163 12.71 7.29C12.6149 7.19896 12.5028 7.12759 12.38 7.08ZM12 2C10.0222 2 8.08879 2.58649 6.4443 3.6853C4.79981 4.78412 3.51809 6.3459 2.76121 8.17317C2.00433 10.0004 1.8063 12.0111 2.19215 13.9509C2.578 15.8907 3.53041 17.6725 4.92894 19.0711C6.32746 20.4696 8.10929 21.422 10.0491 21.8079C11.9889 22.1937 13.9996 21.9957 15.8268 21.2388C17.6541 20.4819 19.2159 19.2002 20.3147 17.5557C21.4135 15.9112 22 13.9778 22 12C22 10.6868 21.7413 9.38642 21.2388 8.17317C20.7363 6.95991 19.9997 5.85752 19.0711 4.92893C18.1425 4.00035 17.0401 3.26375 15.8268 2.7612C14.6136 2.25866 13.3132 2 12 2ZM12 20C10.4178 20 8.87104 19.5308 7.55544 18.6518C6.23985 17.7727 5.21447 16.5233 4.60897 15.0615C4.00347 13.5997 3.84504 11.9911 4.15372 10.4393C4.4624 8.88743 5.22433 7.46197 6.34315 6.34315C7.46197 5.22433 8.88743 4.4624 10.4393 4.15372C11.9911 3.84504 13.5997 4.00346 15.0615 4.60896C16.5233 5.21447 17.7727 6.23984 18.6518 7.55544C19.5308 8.87103 20 10.4177 20 12C20 14.1217 19.1572 16.1566 17.6569 17.6569C16.1566 19.1571 14.1217 20 12 20Z\"></path></svg>Note</p><div class=\"starlight-aside__content\"><p>One-click desktop connect (an <code dir=\"auto\">xnet://</code> link that fills this in for you) is on the\nway. Until then, the copy-and-paste step above is all that’s needed.</p></div>"
        })]
      }), createVNode($$TabItem, {
        label: "Mobile",
        children: createVNode($$Steps, {
          "set:html": "<ol>\n<li>Install xNet on your phone and open it.</li>\n<li>Create your passkey, then choose <strong>Connect xNet Cloud hub</strong>.</li>\n<li>Approve the short code it shows on your dashboard under <strong>Connect your apps →\nEnter a code</strong>.</li>\n</ol>"
        })
      })]
    }), "\n", createVNode(Fragment$1, {
      "set:html": "<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"what-the-device-code-is\">What the device code is</h2><a class=\"sl-anchor-link\" href=\"#what-the-device-code-is\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “What the device code is”</span></a></div>\n<p>The short code is a standard\n<a href=\"https://datatracker.ietf.org/doc/html/rfc8628\">device authorization</a> flow — the same\npattern you’ve used to sign a TV or a CLI into an account:</p>\n<pre class=\"mermaid\" dir=\"ltr\">sequenceDiagram\n  participant App as Your app\n  participant Cloud as xNet Cloud\n  participant You as You (dashboard)\n  App->>Cloud: I'm did:key:… — start a connection\n  Cloud-->>App: Show code ABCD-7K2P\n  You->>Cloud: Approve ABCD-7K2P (you're signed in)\n  loop until approved\n    App->>Cloud: Is ABCD-7K2P approved yet?\n  end\n  Cloud-->>App: Approved — here's your hub URL\n  App->>App: Connect &#x26; sync\n</pre>\n<p>The code is short-lived (about 10 minutes). If it expires, just restart the\nconnection from your app to get a fresh one.</p>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"troubleshooting\">Troubleshooting</h2><a class=\"sl-anchor-link\" href=\"#troubleshooting\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Troubleshooting”</span></a></div>\n<ul>\n<li><strong>“Code not found or expired.”</strong> Codes last ~10 minutes. Restart <strong>Connect xNet\nCloud hub</strong> in your app for a new one, then enter it promptly.</li>\n<li><strong>Desktop app won’t connect after pasting the URL.</strong> Make sure you pasted the full\n<code dir=\"auto\">wss://…</code> hub URL into <strong>Signaling server</strong>, then fully restart the app. You still\nneed to create your passkey and approve a code — pasting the URL alone only points\nthe app at the hub.</li>\n<li><strong>Hub shows “Sleeping” on the dashboard.</strong> Cold hubs wake on the next connection;\ngive it a few seconds after your app reconnects.</li>\n<li><strong>Still stuck?</strong> See the <a href=\"https://xnet.fyi/cloud/pricing#faq\">pricing FAQ</a> or check\nthe <a href=\"https://xnet.fyi/status\">status page</a>.</li>\n</ul>\n<div class=\"sl-heading-wrapper level-h2\"><h2 id=\"related\">Related</h2><a class=\"sl-anchor-link\" href=\"#related\"><span aria-hidden=\"true\" class=\"sl-anchor-icon\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path fill=\"currentcolor\" d=\"m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 0 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42Zm8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 0 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 1 0 1.42 1.42l3.88-3.89a4.49 4.49 0 0 0 0-6.33ZM8.83 15.17a1 1 0 0 0 1.1.22 1 1 0 0 0 .32-.22l4.92-4.92a1 1 0 0 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42Z\"></path></svg></span><span class=\"sr-only\" data-pagefind-ignore>Section titled “Related”</span></a></div>\n<ul>\n<li><a href=\"/docs/guides/hub/\">Hub &#x26; Signaling</a> — self-host your own hub instead</li>\n<li><a href=\"/docs/guides/identity/\">Identity &#x26; Keys</a> — how passkeys and <code dir=\"auto\">did:key</code> work</li>\n<li><a href=\"/docs/guides/electron/\">Electron Setup</a> — the desktop app</li>\n</ul>"
    })]
  });
}
function MDXContent(props = {}) {
  const {wrapper: MDXLayout} = props.components || ({});
  return MDXLayout ? createVNode(MDXLayout, {
    ...props,
    children: createVNode(_createMdxContent, {
      ...props
    })
  }) : _createMdxContent(props);
}
function _missingMdxReference(id, component) {
  throw new Error("Expected " + ("component" ) + " `" + id + "` to be defined: you likely forgot to import, pass, or provide it.");
}

const url = "src/content/docs/docs/guides/cloud-connect.mdx";
const file = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/guides/cloud-connect.mdx";
const Content = (props = {}) => MDXContent({
  ...props,
  components: { Fragment: Fragment, ...props.components, },
});
Content[Symbol.for('mdx-component')] = true;
Content[Symbol.for('astro.needsHeadRendering')] = !Boolean(frontmatter.layout);
Content.moduleId = "/home/runner/work/xNet/xNet/site/src/content/docs/docs/guides/cloud-connect.mdx";
__astro_tag_component__(Content, 'astro:jsx');

export { Content, Content as default, file, frontmatter, getHeadings, url };
