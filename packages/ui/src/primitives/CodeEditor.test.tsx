import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CodeEditor, codeMirrorLanguage } from './CodeEditor'

describe('codeMirrorLanguage', () => {
  it('returns an extension for every supported language', () => {
    for (const lang of ['javascript', 'typescript', 'python', 'rust', 'c', 'plaintext'] as const) {
      expect(codeMirrorLanguage(lang)).toBeDefined()
    }
  })
})

describe('CodeEditor', () => {
  it('mounts a CodeMirror editor with the initial value', () => {
    render(<CodeEditor value="const x = 1" language="javascript" onChange={() => {}} />)
    const host = screen.getByTestId('code-editor')
    expect(host).toBeTruthy()
    // CodeMirror appends its editor DOM into the host.
    expect(host.querySelector('.cm-editor')).toBeTruthy()
    expect(host.textContent).toContain('const x = 1')
  })

  it('renders without an onChange handler', () => {
    expect(() => render(<CodeEditor value="42" language="plaintext" />)).not.toThrow()
  })

  it('accepts an onRun handler prop', () => {
    const onRun = vi.fn()
    expect(() => render(<CodeEditor value="" language="javascript" onRun={onRun} />)).not.toThrow()
  })
})
