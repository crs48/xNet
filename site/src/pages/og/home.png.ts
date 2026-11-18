import type { APIRoute } from 'astro'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

export const GET: APIRoute = async () => {
  const mark = (await readFile(resolve('public/favicon.svg'))).toString('base64')
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#ffffff"/>
    <g font-family="Arial, sans-serif" fill="#252b35">
      <image href="data:image/svg+xml;base64,${mark}" x="64" y="52" width="44" height="44"/>
      <text x="122" y="84" font-size="32" font-weight="700">xNet</text>
      <text x="64" y="203" font-size="13" letter-spacing="2" fill="#586270">AN OPEN, LOCAL-FIRST FOUNDATION</text>
      <text x="60" y="290" font-size="62" font-weight="700" letter-spacing="-3">Your data should</text>
      <text x="60" y="369" font-size="62" font-weight="700" letter-spacing="-3">outlast your apps.</text>
      <text x="64" y="442" font-size="23" fill="#586270">Software you can shape, together.</text>
      <text x="64" y="559" font-size="16" fill="#586270">xnet.fyi · Open source · In development</text>
      <g transform="translate(755 144)">
        <rect x="0" y="0" width="350" height="310" rx="24" fill="#f8f9fb" stroke="#dde2e8"/>
        <g fill="#ffffff" stroke="#d3d9e5"><rect x="25" y="29" width="92" height="106" rx="13"/><rect x="129" y="29" width="92" height="106" rx="13" fill="#eef1fa"/><rect x="233" y="29" width="92" height="106" rx="13"/></g>
        <g fill="#8693b6"><rect x="41" y="50" width="59" height="7" rx="3"/><rect x="41" y="65" width="43" height="7" rx="3"/><rect x="41" y="80" width="51" height="7" rx="3"/><rect x="147" y="47" width="15" height="41" rx="3"/><rect x="167" y="60" width="15" height="28" rx="3"/><rect x="187" y="72" width="15" height="16" rx="3"/><rect x="250" y="49" width="24" height="36" rx="4"/><rect x="281" y="49" width="24" height="24" rx="4"/></g>
        <g font-size="12" text-anchor="middle"><text x="71" y="117">A chat</text><text x="175" y="117">A planner</text><text x="279" y="117">Your app</text></g>
        <path d="M71 135V178H279V135M175 135V216" fill="none" stroke="#9aa8c7" stroke-width="2" stroke-dasharray="4 4"/>
        <rect x="25" y="216" width="300" height="66" rx="13" fill="#e6eafa" stroke="#b8c2dc"/>
        <text x="175" y="256" text-anchor="middle" font-size="20">Your shared data</text>
      </g>
    </g>
  </svg>`
  const image = await sharp(Buffer.from(card)).png().toBuffer()
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/png' } })
}
