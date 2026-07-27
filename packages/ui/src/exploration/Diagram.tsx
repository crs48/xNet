/**
 * `<Diagram>` — a mermaid block for visual explorations (exploration 0403).
 *
 * Ports the site's shim (`site/astro.config.mjs` + `site/src/components/docs/Head.astro`):
 * emit `<pre class="mermaid">` carrying the source in `data-source`, then render
 * it client-side, re-running on theme change.
 *
 * IMPORTANT — mermaid is NOT a dependency of `@xnetjs/ui`, and `.storybook/main.ts`
 * deliberately externalizes it (`rollupOptions.external` + `optimizeDeps.exclude`)
 * because it is heavy and only `packages/canvas` / `packages/editor` need it. So
 * the import here is dynamic and **allowed to fail**: when mermaid is absent the
 * block degrades to its own readable source rather than rendering nothing. That
 * is deliberate — a visibly-unrendered diagram is honest; a silently-empty one
 * would be the visual form of a false success.
 */
import React, { useEffect, useRef, useState } from 'react'

export interface DiagramProps {
  /** Raw mermaid source, e.g. `flowchart TD\n  A --> B`. */
  chart: string
  /** Optional caption rendered beneath the diagram. */
  label?: string
}

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void
  run: (opts: { nodes: HTMLElement[] }) => Promise<void>
}

// The specifier is assembled at runtime on purpose. `mermaid` is not a
// dependency of this package (see the file header), so a literal specifier
// would fail typecheck and, under a bundler, become a hard build error instead
// of the soft degradation this component is designed around.
const MERMAID_SPECIFIER = 'mer' + 'maid'

async function loadMermaid(): Promise<MermaidModule | null> {
  try {
    const mod = (await import(/* @vite-ignore */ MERMAID_SPECIFIER)) as {
      default?: MermaidModule
    }

    return mod.default ?? null
  } catch {
    return null
  }
}

export function Diagram({ chart, label }: DiagramProps): React.ReactElement {
  const ref = useRef<HTMLPreElement>(null)
  const [unrendered, setUnrendered] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false

    void (async () => {
      const mermaid = await loadMermaid()
      if (cancelled) return
      if (!mermaid) {
        setUnrendered(true)

        return
      }
      const isLight = !document.documentElement.classList.contains('dark')
      mermaid.initialize({ startOnLoad: false, theme: isLight ? 'default' : 'dark' })
      el.removeAttribute('data-processed')
      el.innerHTML = chart
      await mermaid.run({ nodes: [el] })
    })()

    return () => {
      cancelled = true
    }
  }, [chart])

  return (
    <figure style={{ margin: '16px 0' }}>
      <pre
        ref={ref}
        className="mermaid"
        data-source={chart}
        style={
          unrendered
            ? {
                margin: 0,
                padding: '12px',
                overflowX: 'auto',
                border: '1px solid hsl(var(--hairline))',
                borderRadius: 'var(--radius-md)',
                background: 'hsl(var(--island-b))',
                color: 'hsl(var(--ink-2))',
                fontSize: '12px'
              }
            : { margin: 0 }
        }
      >
        {chart}
      </pre>
      {unrendered ? (
        <figcaption style={{ fontSize: '11px', color: 'hsl(var(--ink-3))', marginTop: '4px' }}>
          mermaid unavailable in this renderer — showing source
        </figcaption>
      ) : null}
      {label ? (
        <figcaption style={{ fontSize: '12px', color: 'hsl(var(--ink-2))', marginTop: '6px' }}>
          {label}
        </figcaption>
      ) : null}
    </figure>
  )
}
