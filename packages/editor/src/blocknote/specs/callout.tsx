/**
 * Callout block (info/tip/warning/…). Replaces the TipTap CalloutExtension.
 *
 * BlockNote custom blocks can't contain child blocks (0312), so a callout
 * holds inline content; nested structure lives in indented `children`
 * blocks (Notion-style) rather than inside the callout container.
 */
import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'
import { CALLOUT_CONFIGS, type CalloutType } from '../callout-config'

const CALLOUT_TYPES = Object.keys(CALLOUT_CONFIGS) as CalloutType[]

function coerceCalloutType(raw: string): CalloutType {
  return (CALLOUT_TYPES as readonly string[]).includes(raw) ? (raw as CalloutType) : 'info'
}

export const CalloutBlockSpec = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      kind: { default: 'info', values: CALLOUT_TYPES }
    },
    content: 'inline'
  },
  {
    render: ({ block, contentRef, editor }) => {
      const kind = coerceCalloutType(block.props.kind)
      const config = CALLOUT_CONFIGS[kind]
      return (
        <div
          data-callout={kind}
          className={`xnet-callout border rounded-md p-3 flex gap-2 ${config.bgClass} ${config.borderClass}`}
        >
          <button
            type="button"
            className={`xnet-callout-icon ${config.iconClass}`}
            aria-label={`Change callout type (${config.label})`}
            contentEditable={false}
            onClick={() => {
              const next = CALLOUT_TYPES[(CALLOUT_TYPES.indexOf(kind) + 1) % CALLOUT_TYPES.length]
              editor.updateBlock(block, { props: { kind: next } })
            }}
          >
            {config.icon}
          </button>
          <div className="xnet-callout-content flex-1" ref={contentRef} />
        </div>
      )
    }
  }
)
