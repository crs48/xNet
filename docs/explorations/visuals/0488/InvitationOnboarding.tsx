import type { CSSProperties } from 'react'
import { Screen } from '@xnetjs/ui/exploration'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import './onboarding.css'

type Scenario = 'group' | 'approval' | 'contact'
type Step =
  | 'landing'
  | 'install'
  | 'identity'
  | 'oauth'
  | 'profile'
  | 'restore'
  | 'review'
  | 'pending'
  | 'chat'
  | 'expired'
type Provider = 'Bluesky' | 'X' | 'Google' | 'name'

const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '16px' }
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }

const destinations = {
  group: {
    name: 'Reading group',
    action: 'Join group',
    note: 'Chris invited you. You can join when you’re ready.'
  },
  approval: {
    name: 'Reading group',
    action: 'Request to join',
    note: 'Chris shared this group. A host approves new members.'
  },
  contact: {
    name: 'Chris',
    action: 'Send message request',
    note: 'Say hello. Chris can accept your message request.'
  }
} satisfies Record<Scenario, { name: string; action: string; note: string }>

export function InvitationOnboarding() {
  const [scenario, setScenario] = useState<Scenario>('group')
  const [step, setStep] = useState<Step>('landing')
  const [provider, setProvider] = useState<Provider>('Bluesky')
  const [name, setName] = useState('Maya')
  const [intro, setIntro] = useState('Hey Chris, it’s Maya from the reading group!')
  const [message, setMessage] = useState('Happy to be here!')
  const [sent, setSent] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [profileReady, setProfileReady] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const destination = destinations[scenario]
  const isGroup = scenario !== 'contact'
  const inBrowser = step === 'landing' || step === 'install'

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  const reset = (next: Scenario = scenario) => {
    setScenario(next)
    setStep('landing')
    setProvider('Bluesky')
    setName('Maya')
    setSent([])
    setNotice('')
    setIntro('Hey Chris, it’s Maya from the reading group!')
    setMessage('Happy to be here!')
    setProfileReady(false)
  }
  const signIn = (next: Provider) => {
    setProvider(next)
    setNotice('')
    setProfileReady(false)
    setStep(next === 'name' ? 'profile' : 'oauth')
  }
  const title: Record<Step, string> = {
    landing: isGroup ? 'You’re invited to Reading group' : 'Connect with Chris',
    install: 'Your invitation is waiting',
    identity: 'How would you like to continue?',
    oauth: `Continue in your browser`,
    profile: 'What should we call you?',
    restore: 'Welcome back, Maya',
    review: isGroup ? 'Ready to join?' : 'Say hello to Chris',
    pending: isGroup ? 'Your request is with the hosts' : 'Your request is with Chris',
    chat: destination.name,
    expired: 'This invitation has expired'
  }

  const [appearance, setAppearance] = useState<'light' | 'dark'>('light')
  return (
    <div
      className={`onboarding-exploration ${appearance}`}
      style={{
        ...stack,
        padding: '16px',
        background: 'hsl(var(--surface-0))',
        color: 'hsl(var(--ink-1))'
      }}
    >
      <fieldset
        style={{ ...row, padding: '12px', border: '1px solid currentColor', borderRadius: '8px' }}
      >
        <legend>Prototype controls · no real accounts or downloads</legend>
        <label>
          Try a journey{' '}
          <select
            aria-label="Journey"
            value={scenario}
            onChange={(event) => reset(event.target.value as Scenario)}
          >
            <option value="group">Invited to a group</option>
            <option value="approval">Group requiring approval</option>
            <option value="contact">Contact link</option>
          </select>
        </label>
        <label>
          Appearance{' '}
          <select
            aria-label="Preview appearance"
            value={appearance}
            onChange={(event) => setAppearance(event.target.value as 'light' | 'dark')}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button onClick={() => reset()}>Restart preview</button>
        {step === 'oauth' && (
          <>
            <button onClick={() => setStep('profile')}>Simulate successful sign-in</button>
            <button
              onClick={() => {
                setNotice('Sign-in was cancelled. Your invitation is still here.')
                setStep('identity')
              }}
            >
              Simulate cancellation
            </button>
            <button onClick={() => setStep('restore')}>Simulate existing account</button>
          </>
        )}
        {step === 'restore' && (
          <button
            onClick={() => {
              setProfileReady(true)
              setNotice('')
              setStep('review')
            }}
          >
            Simulate device approval
          </button>
        )}
        {step === 'pending' && <button onClick={() => setStep('chat')}>Simulate acceptance</button>}
        {['identity', 'profile', 'review'].includes(step) && (
          <button onClick={() => setStep('expired')}>Expire invitation</button>
        )}
      </fieldset>

      <div style={{ display: 'grid' }}>
        <Screen
          surface={inBrowser ? 'browser' : 'desktop'}
          label={`${inBrowser ? 'Browser handoff' : 'Desktop onboarding'} · proposed interface · ${step}`}
        >
          <div style={{ ...stack, padding: '32px' }}>
            <header style={{ ...row, justifyContent: 'space-between' }}>
              <strong>xNet</strong>
              <span className="wf-pill">
                {inBrowser ? 'An invitation for you' : 'Your people, together'}
              </span>
            </header>
            {step !== 'chat' && (
              <div className="wf-card" style={row}>
                <div>
                  <strong>{isGroup ? 'Reading group' : 'Chris'}</strong>
                  <p className="wf-muted">{destination.note}</p>
                </div>
              </div>
            )}
            <h1 ref={heading} tabIndex={-1}>
              {title[step]}
            </h1>
            {notice && <p role="status">{notice}</p>}

            {step === 'landing' && (
              <div style={stack}>
                <p>
                  {isGroup
                    ? 'A place to share what we’re reading, and talk about it.'
                    : 'A private conversation with a friend.'}
                </p>
                <p className="wf-muted">
                  Get the desktop app to continue. Your invitation stays on this page.
                </p>
                <div style={row}>
                  <button className="primary" onClick={() => setStep('install')}>
                    Get xNet for your computer
                  </button>
                  <button onClick={() => setStep('identity')}>Open in xNet</button>
                </div>
                <small>
                  {isGroup
                    ? 'Private group · Join as a member · New messages from joining'
                    : 'Chris chooses whether to accept your request.'}
                </small>
              </div>
            )}
            {step === 'install' && (
              <div style={stack}>
                <ol>
                  <li>Install xNet on your computer.</li>
                  <li>Return here to open this invitation.</li>
                </ol>
                <button className="primary" onClick={() => setStep('identity')}>
                  I’ve installed xNet — continue
                </button>
                <details>
                  <summary>Having trouble opening the app?</summary>
                  <p>
                    Copy your original invitation link and paste it into “Open an invitation” in
                    xNet.
                  </p>
                  <small>This preview does not generate a usable invitation.</small>
                </details>
              </div>
            )}
            {step === 'identity' && (
              <div style={stack}>
                <p>A name your people will recognize. No new username to remember.</p>
                <button className="primary" onClick={() => signIn('Bluesky')}>
                  Continue with Bluesky
                </button>
                <button onClick={() => signIn('X')}>Continue with X</button>
                <details>
                  <summary>More ways to continue</summary>
                  <div style={{ ...stack, paddingTop: '12px' }}>
                    <button onClick={() => signIn('Google')}>Continue with Google</button>
                    <small>Available providers depend on the app’s configuration.</small>
                  </div>
                </details>
                <button onClick={() => signIn('name')}>Use a name instead</button>
                <small>Connecting a social account doesn’t make you publicly discoverable.</small>
              </div>
            )}
            {step === 'oauth' && (
              <div style={stack}>
                <p role="status">
                  Finish signing in with {provider} in your browser. We’ll keep your invitation
                  here.
                </p>
                <button
                  onClick={() => {
                    setNotice('Your invitation is still here. Choose how you’d like to continue.')
                    setStep('identity')
                  }}
                >
                  Choose another way
                </button>
                <small>Use the prototype controls above to simulate the browser’s response.</small>
              </div>
            )}
            {step === 'profile' && (
              <form
                style={stack}
                onSubmit={(event) => {
                  event.preventDefault()
                  if (name.trim()) {
                    setProfileReady(true)
                    setNotice('')
                    setStep('review')
                  }
                }}
              >
                {provider !== 'name' && (
                  <p className="wf-pill">
                    {provider} connected ·{' '}
                    {provider === 'Bluesky'
                      ? '@maya.bsky.social'
                      : provider === 'X'
                        ? '@maya_reads'
                        : 'Maya’s Google account'}
                  </p>
                )}
                <label style={stack}>
                  Your name in xNet
                  <input
                    autoComplete="nickname"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                    required
                  />
                </label>
                <small>
                  This is the name people in your conversation will see. You can change it later.
                </small>
                <button className="primary" disabled={!name.trim()}>
                  Continue as {name.trim() || '…'}
                </button>
                <button type="button" onClick={() => setStep('identity')}>
                  Use another account
                </button>
              </form>
            )}
            {step === 'restore' && (
              <div style={stack}>
                <p>This social account is connected to an existing xNet identity.</p>
                <p>
                  Approve this computer from another device, or restore your recovery key, to
                  continue as the same person.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    setNotice(
                      'Approval requested in this preview. Use “Simulate device approval” above to continue.'
                    )
                  }
                >
                  Approve from another device
                </button>
                <button
                  onClick={() =>
                    setNotice(
                      'A production recovery screen would restore your keys here. This preview does not collect recovery secrets.'
                    )
                  }
                >
                  Use recovery key
                </button>
                <small>Your invitation is saved while you reconnect.</small>
              </div>
            )}
            {step === 'review' && (
              <form
                style={stack}
                onSubmit={(event) => {
                  event.preventDefault()
                  setNotice('')
                  setStep(scenario === 'group' ? 'chat' : 'pending')
                }}
              >
                <div style={row}>
                  <strong>Continue as {name}</strong>
                  <button type="button" onClick={() => setStep('identity')}>
                    Switch
                  </button>
                </div>
                {isGroup ? (
                  <div className="wf-card" style={stack}>
                    <p>Access: Reading group only</p>
                    <p>Role: Member</p>
                    <p>History: Messages from when you join</p>
                    <small>
                      {scenario === 'approval'
                        ? 'A host will approve your request before you can see messages.'
                        : 'This invitation lets you join without waiting for another approval.'}
                    </small>
                  </div>
                ) : (
                  <label style={stack}>
                    Your first message
                    <textarea
                      value={intro}
                      onChange={(event) => setIntro(event.target.value)}
                      maxLength={500}
                      required
                    />
                  </label>
                )}
                <button className="primary" disabled={!isGroup && !intro.trim()}>
                  {destination.action}
                </button>
                <small>
                  Joining never gives anyone access to files or agents on your computer.
                </small>
              </form>
            )}
            {step === 'pending' && (
              <div style={stack}>
                <p role="status">
                  {isGroup
                    ? 'Request sent · waiting for a host to accept'
                    : 'Message request sent · waiting for Chris to accept'}
                </p>
                {!isGroup && (
                  <div className="wf-card">
                    <strong>{name}</strong>
                    <p>{intro}</p>
                  </div>
                )}
                <p>You can close xNet. This request will be here when you return.</p>
                <button
                  onClick={() => {
                    setStep('review')
                    setNotice('Request cancelled. You can review it and send again.')
                  }}
                >
                  Cancel request
                </button>
              </div>
            )}
            {step === 'chat' && (
              <div style={stack}>
                <p className="wf-muted">
                  {isGroup
                    ? 'You joined · New messages start here'
                    : 'Chris accepted your message request'}
                </p>
                {!isGroup && (
                  <div className="wf-card">
                    <strong>{name}</strong>
                    <p>{intro}</p>
                  </div>
                )}
                <div className="wf-card">
                  <strong>Chris</strong>
                  <p>
                    {isGroup
                      ? `Welcome, ${name}! What have you been reading?`
                      : `Hey ${name}! Good to see you here.`}
                  </p>
                </div>
                {sent.map((text, index) => (
                  <div className="wf-card" key={index}>
                    <strong>{name}</strong>
                    <p>{text}</p>
                  </div>
                ))}
                <form
                  style={row}
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (message.trim()) {
                      setSent([...sent, message.trim()])
                      setMessage('')
                    }
                  }}
                >
                  <label style={{ flex: 1 }}>
                    Message
                    <input
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={500}
                    />
                  </label>
                  <button className="primary" disabled={!message.trim()}>
                    Send
                  </button>
                </form>
                <details>
                  <summary>Protect your account · saved on this device only</summary>
                  <p>
                    Save a recovery key or connect another device. Social sign-in alone cannot
                    recover your private keys.
                  </p>
                </details>
              </div>
            )}
            {step === 'expired' && (
              <div style={stack}>
                <p>Ask Chris for a fresh link. Any account setup you completed is kept.</p>
                <button
                  onClick={() => {
                    setNotice('This preview has loaded a fresh invitation from Chris.')
                    setStep(profileReady ? 'review' : 'identity')
                  }}
                >
                  Try a fresh invitation (preview)
                </button>
                <button onClick={() => reset()}>Restart this preview</button>
              </div>
            )}
          </div>
        </Screen>
      </div>
    </div>
  )
}
