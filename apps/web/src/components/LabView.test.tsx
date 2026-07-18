/**
 * LabView integration test (exploration 0180): create a Lab node, run the
 * default code through the runtime ladder, and surface its output.
 */
import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import { useMemo } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LabView } from './LabView'

// LabView publishes its title against the current route (0353), which
// reads router state. This test renders the view standalone, so stub the
// location rather than standing up a router it doesn't otherwise need.
vi.mock('@tanstack/react-router', () => ({
  useLocation: ({ select }: { select: (l: { pathname: string }) => unknown }) =>
    select({ pathname: '/lab/lab-test-1' })
}))

function Harness({ children }: { children: ReactNode }) {
  const identity = useMemo(() => generateIdentity(), [])
  const storage = useMemo(() => new MemoryNodeStorageAdapter(), [])
  return (
    <XNetProvider
      config={{
        nodeStorage: storage,
        authorDID: identity.identity.did as `did:key:${string}`,
        signingKey: identity.privateKey
      }}
    >
      {children}
    </XNetProvider>
  )
}

describe('LabView', () => {
  it('creates a Lab and renders its editor + controls', async () => {
    render(
      <Harness>
        <LabView labId="lab-test-1" />
      </Harness>
    )
    expect(await screen.findByLabelText('Lab title')).toBeTruthy()
    expect(screen.getByLabelText('Language')).toBeTruthy()
    expect(screen.getByLabelText('Runtime')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByTestId('code-editor').querySelector('.cm-editor')).toBeTruthy()
    )
  })

  it('runs the default code on the sandbox rung and shows the output', async () => {
    render(
      <Harness>
        <LabView labId="lab-test-2" />
      </Harness>
    )
    // Wait for the node + editor to hydrate.
    await screen.findByLabelText('Lab title')
    const runButton = screen.getByRole('button', { name: /run/i })
    fireEvent.click(runButton)

    const output = screen.getByTestId('lab-output')
    await waitFor(
      () => {
        expect(output.textContent).toContain('hello from your Lab')
        expect(output.textContent).toContain('42')
      },
      { timeout: 4000 }
    )
  })
})
