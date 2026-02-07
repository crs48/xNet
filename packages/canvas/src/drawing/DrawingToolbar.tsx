/**
 * Drawing Toolbar Component
 *
 * UI for selecting drawing tools, colors, and sizes.
 */

import type { DrawingTool } from './types'
import { memo, useCallback } from 'react'
import { STROKE_COLORS, STROKE_SIZES, DEFAULT_DRAWING_TOOL } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrawingToolbarProps {
  /** Currently active tool (null = not drawing) */
  activeTool: DrawingTool | null
  /** Called when tool changes */
  onToolChange: (tool: DrawingTool | null) => void
  /** Called when clear is requested */
  onClear?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DrawingToolbar = memo(function DrawingToolbar({
  activeTool,
  onToolChange,
  onClear
}: DrawingToolbarProps) {
  const isActive = activeTool !== null

  const toggleDrawing = useCallback(() => {
    if (isActive) {
      onToolChange(null)
    } else {
      onToolChange({ ...DEFAULT_DRAWING_TOOL })
    }
  }, [isActive, onToolChange])

  const setColor = useCallback(
    (color: string) => {
      if (activeTool) {
        onToolChange({ ...activeTool, strokeColor: color })
      }
    },
    [activeTool, onToolChange]
  )

  const setSize = useCallback(
    (size: number) => {
      if (activeTool) {
        onToolChange({ ...activeTool, strokeWidth: size })
      }
    },
    [activeTool, onToolChange]
  )

  const setType = useCallback(
    (type: DrawingTool['type']) => {
      if (activeTool) {
        const opacity = type === 'highlighter' ? 0.4 : 1
        onToolChange({ ...activeTool, type, opacity })
      }
    },
    [activeTool, onToolChange]
  )

  return (
    <div className="drawing-toolbar" style={styles.toolbar}>
      <button
        className={`tool-button ${isActive ? 'active' : ''}`}
        onClick={toggleDrawing}
        title={isActive ? 'Exit drawing mode' : 'Enter drawing mode'}
        style={{
          ...styles.button,
          ...(isActive ? styles.buttonActive : {})
        }}
      >
        <PenIcon />
      </button>

      {isActive && (
        <>
          <div style={styles.divider} />

          {/* Tool Type */}
          <div style={styles.toolTypes}>
            <button
              className={activeTool.type === 'pen' ? 'selected' : ''}
              onClick={() => setType('pen')}
              title="Pen"
              style={{
                ...styles.typeButton,
                ...(activeTool.type === 'pen' ? styles.typeButtonSelected : {})
              }}
            >
              <PenIcon />
            </button>
            <button
              className={activeTool.type === 'highlighter' ? 'selected' : ''}
              onClick={() => setType('highlighter')}
              title="Highlighter"
              style={{
                ...styles.typeButton,
                ...(activeTool.type === 'highlighter' ? styles.typeButtonSelected : {})
              }}
            >
              <HighlighterIcon />
            </button>
          </div>

          <div style={styles.divider} />

          {/* Color Picker */}
          <div className="color-picker" style={styles.colorPicker}>
            {STROKE_COLORS.map((color) => (
              <button
                key={color}
                className={`color-option ${activeTool.strokeColor === color ? 'selected' : ''}`}
                style={{
                  ...styles.colorOption,
                  backgroundColor: color,
                  ...(activeTool.strokeColor === color ? styles.colorOptionSelected : {})
                }}
                onClick={() => setColor(color)}
                title={color}
              />
            ))}
          </div>

          <div style={styles.divider} />

          {/* Size Picker */}
          <div className="size-picker" style={styles.sizePicker}>
            {STROKE_SIZES.map((size) => (
              <button
                key={size}
                className={`size-option ${activeTool.strokeWidth === size ? 'selected' : ''}`}
                onClick={() => setSize(size)}
                title={`Size ${size}`}
                style={{
                  ...styles.sizeOption,
                  ...(activeTool.strokeWidth === size ? styles.sizeOptionSelected : {})
                }}
              >
                <div
                  className="size-dot"
                  style={{
                    ...styles.sizeDot,
                    width: Math.min(size * 2, 16),
                    height: Math.min(size * 2, 16)
                  }}
                />
              </button>
            ))}
          </div>

          {onClear && (
            <>
              <div style={styles.divider} />

              <button
                className="tool-button"
                onClick={onClear}
                title="Clear all drawings"
                style={styles.button}
              >
                <TrashIcon />
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
})

// ─── Icons ────────────────────────────────────────────────────────────────────

function PenIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M2.5 13.5L1 15l1.5-1.5m0 0l9.5-9.5 2 2-9.5 9.5m-2-2l2 2m6.5-11.5l2 2" />
    </svg>
  )
}

function HighlighterIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 13l10-10M2 14l12-12M4 12l8-8" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 4h10M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1m1.5 0v9a1 1 0 01-1 1h-6a1 1 0 01-1-1V4h8z" />
      <path d="M6.5 7v4M9.5 7v4" />
    </svg>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb'
  },
  button: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#374151'
  },
  buttonActive: {
    background: '#3b82f6',
    color: 'white'
  },
  divider: {
    width: '1px',
    height: '20px',
    background: '#e5e7eb',
    margin: '0 4px'
  },
  toolTypes: {
    display: 'flex',
    gap: '2px'
  },
  typeButton: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#6b7280'
  },
  typeButtonSelected: {
    background: '#dbeafe',
    color: '#3b82f6'
  },
  colorPicker: {
    display: 'flex',
    gap: '4px'
  },
  colorOption: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid transparent',
    cursor: 'pointer',
    padding: 0
  },
  colorOptionSelected: {
    borderColor: '#3b82f6',
    boxShadow: '0 0 0 2px white'
  },
  sizePicker: {
    display: 'flex',
    gap: '4px'
  },
  sizeOption: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid transparent',
    background: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0
  },
  sizeOptionSelected: {
    borderColor: '#3b82f6',
    background: '#dbeafe'
  },
  sizeDot: {
    borderRadius: '50%',
    background: '#374151'
  }
}
