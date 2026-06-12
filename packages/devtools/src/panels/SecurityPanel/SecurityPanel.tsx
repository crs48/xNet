/**
 * SecurityPanel - Multi-level cryptography status and configuration
 *
 * Displays current security level, key availability, and signature info.
 */

import { useSecurityContextOptional, useSecurity } from '@xnetjs/react'

// Signature size info by level
const SIGNATURE_SIZES = {
  0: { label: 'Ed25519', size: '64 bytes' },
  1: { label: 'Ed25519 + ML-DSA-65', size: '~3.4 KB' },
  2: { label: 'ML-DSA-65', size: '~3.3 KB' }
} as const

// Level color coding
const LEVEL_COLORS = {
  0: 'bg-ink-3',
  1: 'bg-ink-2',
  2: 'bg-ink-1'
} as const

const LEVEL_LABELS = {
  0: 'Classical (Ed25519)',
  1: 'Hybrid (Ed25519 + ML-DSA)',
  2: 'Post-Quantum (ML-DSA)'
} as const

export function SecurityPanel() {
  const context = useSecurityContextOptional()

  if (!context) {
    return (
      <div className="flex items-center justify-center h-full text-ink-3 text-xs">
        <div className="text-center">
          <p>SecurityProvider not available</p>
          <p className="text-[10px] mt-1 text-ink-3">
            Ensure XNetProvider is configured with a keyBundle
          </p>
        </div>
      </div>
    )
  }

  return <SecurityPanelContent />
}

function SecurityPanelContent() {
  const { level, hasPQKeys, maxLevel, canSignAt, hasKeyBundle, setLevel } = useSecurity()
  const context = useSecurityContextOptional()!

  return (
    <div className="flex flex-col h-full">
      {/* Header with current level */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-hairline shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${LEVEL_COLORS[level]}`} />
          <span className="text-sm font-medium text-ink-1">Level {level}</span>
          <span className="text-xs text-ink-3">{LEVEL_LABELS[level]}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-ink-3">
          <span>Policy: {context.verificationPolicy}</span>
          <span>|</span>
          <span>Min Level: {context.minVerificationLevel}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Key Status */}
        <section>
          <h3 className="text-xs font-bold text-ink-2 mb-2">Key Status</h3>
          <div className="bg-surface-2 rounded p-3 space-y-2">
            <StatusRow
              label="Key Bundle"
              value={hasKeyBundle ? 'Available' : 'Not configured'}
              success={hasKeyBundle}
            />
            <StatusRow
              label="Ed25519 Keys"
              value={hasKeyBundle ? 'Available' : 'Missing'}
              success={hasKeyBundle}
            />
            <StatusRow
              label="ML-DSA Keys (PQ)"
              value={hasPQKeys ? 'Available' : 'Not available'}
              success={hasPQKeys}
            />
            <StatusRow label="Max Supported Level" value={`Level ${maxLevel}`} />
          </div>
        </section>

        {/* Level Selector */}
        <section>
          <h3 className="text-xs font-bold text-ink-2 mb-2">Security Level</h3>
          <div className="bg-surface-2 rounded p-3">
            <div className="flex gap-2">
              {([0, 1, 2] as const).map((l) => (
                <LevelButton
                  key={l}
                  level={l}
                  isActive={level === l}
                  canSign={canSignAt(l)}
                  onClick={() => setLevel(l)}
                />
              ))}
            </div>
            <p className="text-[10px] text-ink-3 mt-2">
              {!canSignAt(level) && (
                <span className="text-warning">
                  Warning: Cannot sign at Level {level} without PQ keys.{' '}
                </span>
              )}
              Select the default security level for new signatures.
            </p>
          </div>
        </section>

        {/* Signature Sizes */}
        <section>
          <h3 className="text-xs font-bold text-ink-2 mb-2">Signature Sizes</h3>
          <div className="bg-surface-2 rounded p-3">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-ink-3">
                  <th className="text-left font-normal pb-1">Level</th>
                  <th className="text-left font-normal pb-1">Algorithm</th>
                  <th className="text-right font-normal pb-1">Size</th>
                </tr>
              </thead>
              <tbody className="text-ink-2">
                {([0, 1, 2] as const).map((l) => (
                  <tr key={l} className={level === l ? 'text-ink-1' : ''}>
                    <td className="py-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${LEVEL_COLORS[l]}`} />
                        Level {l}
                      </div>
                    </td>
                    <td className="py-0.5">{SIGNATURE_SIZES[l].label}</td>
                    <td className="py-0.5 text-right font-mono">{SIGNATURE_SIZES[l].size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Level Descriptions */}
        <section>
          <h3 className="text-xs font-bold text-ink-2 mb-2">Level Descriptions</h3>
          <div className="bg-surface-2 rounded p-3 space-y-3 text-[10px] text-ink-2">
            <div>
              <div className="flex items-center gap-1.5 text-ink-2 mb-0.5">
                <div className={`w-2 h-2 rounded-full ${LEVEL_COLORS[0]}`} />
                <span className="font-medium">Level 0 - Classical</span>
              </div>
              <p>
                Ed25519 signatures only. Fast (64 bytes), widely compatible. Default for most
                operations.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-ink-2 mb-0.5">
                <div className={`w-2 h-2 rounded-full ${LEVEL_COLORS[1]}`} />
                <span className="font-medium">Level 1 - Hybrid</span>
              </div>
              <p>
                Ed25519 + ML-DSA-65 dual signatures. Post-quantum secure while maintaining classical
                fallback.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-ink-2 mb-0.5">
                <div className={`w-2 h-2 rounded-full ${LEVEL_COLORS[2]}`} />
                <span className="font-medium">Level 2 - Post-Quantum</span>
              </div>
              <p>ML-DSA-65 only. Full post-quantum security. Larger signatures (~3.3 KB).</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────

function StatusRow({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-ink-3">{label}</span>
      <span
        className={success === undefined ? 'text-ink-2' : success ? 'text-success' : 'text-ink-3'}
      >
        {value}
      </span>
    </div>
  )
}

function LevelButton({
  level,
  isActive,
  canSign,
  onClick
}: {
  level: 0 | 1 | 2
  isActive: boolean
  canSign: boolean
  onClick: () => void
}) {
  const labels = ['L0', 'L1', 'L2']

  return (
    <button
      onClick={onClick}
      disabled={!canSign}
      className={`
        flex-1 px-3 py-2 rounded text-xs font-medium transition-colors
        ${
          isActive
            ? 'bg-primary text-primary-foreground'
            : canSign
              ? 'bg-background-emphasis text-ink-2 hover:bg-border-emphasis hover:text-ink-1'
              : 'bg-surface-2 text-ink-3 cursor-not-allowed'
        }
      `}
      title={!canSign ? 'PQ keys required for this level' : `Select Level ${level}`}
    >
      <div className="text-center">
        <div>{labels[level]}</div>
        <div className="text-[9px] opacity-75 mt-0.5">
          {level === 0 ? 'Ed25519' : level === 1 ? 'Hybrid' : 'PQ'}
        </div>
      </div>
    </button>
  )
}
