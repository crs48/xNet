export const orbitArenaSource = `import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { rooms } from '@xnetjs/extensions/multiplayer'

const COLORS = [0x62e5be, 0xffc857, 0xb4a0ff, 0xff88a4]
const foodPosition = (i, generation) => [Math.sin(i * 43.13 + generation * 7.7) * 8.8, Math.cos(i * 17.51 + generation * 3.3) * 8.8]
const freshPlayer = (id, index) => [id, index % 2 ? 5 : -5, index > 1 ? 5 : -5, 6, 0]
const validNumber = v => typeof v === 'number' && Number.isFinite(v)
const round = n => Math.round(n * 100) / 100
export default function OrbitArena() {
  const canvas = useRef(null), world = useRef({ tick: 0, players: [freshPlayer('practice', 0)], food: Array(24).fill(0) })
  const input = useRef([0, 0]), room = useRef(rooms.current()), inputs = useRef(new Map())
  const [session, setSession] = useState(rooms.current()), [invite, setInvite] = useState(''), [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('Practice locally, or invite up to three friends.'), [score, setScore] = useState(0)
  const [graphicsError, setGraphicsError] = useState(''), [players, setPlayers] = useState(1)
  const [board, setBoard] = useState([{ id: 'practice', index: 0, score: 0 }])
  const invitationField = useRef(null)
  useEffect(() => rooms.subscribe(event => {
    if (event.type === 'error' || event.type === 'status') setNotice(event.message)
    if (event.type === 'state') {
      const previous = room.current
      room.current = event.room
      setSession(event.room)
      if (previous?.id !== event.room?.id) {
        world.current = { tick: 0, players: event.room?.role === 'guest' ? [] : [freshPlayer(event.room?.self ?? 'practice', 0)], food: Array(24).fill(0) }
        inputs.current.clear(); input.current = [0, 0]
      }
      if (event.room) setNotice(event.room.role === 'host' ? 'You host the simulation. Keep this preview open.' : 'Connected. The host runs the simulation.')
      else if (previous) setNotice('Room closed. You are practicing locally again.')
    }
    if (event.type === 'message') {
      const current = room.current, data = event.data
      if (!current || !Array.isArray(data)) return
      if (current.role === 'host') {
        if (data.length !== 2 || !data.every(validNumber) || data.some(v => Math.abs(v) > 1)) return
        inputs.current.set(event.peer, { vector: data, time: performance.now() })
      } else if (event.peer === current.host && data.length === 3) {
        const [tick, nextPlayers, food] = data
        if (!Number.isSafeInteger(tick) || tick <= world.current.tick || !Array.isArray(nextPlayers) || nextPlayers.length > 4 ||
          !nextPlayers.every(p => Array.isArray(p) && p.length === 5 && typeof p[0] === 'string' && /^[a-f0-9]{64}$/.test(p[0]) && p.slice(1).every(validNumber) && Math.abs(p[1]) <= 10 && Math.abs(p[2]) <= 10 && p[3] >= 6 && p[3] <= 60 && p[4] >= 0) ||
          !Array.isArray(food) || food.length !== 24 || !food.every(v => Number.isSafeInteger(v) && v >= 0 && v <= 100000)) return
        world.current = { tick, players: nextPlayers, food }
      }
    }
  }), [])
  useEffect(() => {
    const interval = setInterval(() => {
      const current = room.current, state = world.current
      const self = current?.self ?? 'practice'
      if (current?.role === 'guest') {
        try { rooms.send(input.current) } catch (error) { setNotice(String(error)) }
      } else {
        const ids = current ? [self, ...current.peers.map(p => p.id)] : [self]
        state.players = ids.map((id, i) => state.players.find(p => p[0] === id) ?? freshPlayer(id, i))
        for (const player of state.players) {
          const remote = inputs.current.get(player[0])
          const vector = player[0] === self ? input.current : remote && performance.now() - remote.time < 350 ? remote.vector : [0, 0]
          const length = Math.max(1, Math.hypot(...vector)), speed = .5 / Math.pow(player[3], .15)
          player[1] = round(Math.max(-9.4, Math.min(9.4, player[1] + vector[0] / length * speed)))
          player[2] = round(Math.max(-9.4, Math.min(9.4, player[2] + vector[1] / length * speed)))
          state.food.forEach((generation, index) => {
            const [x, y] = foodPosition(index, generation)
            if (Math.hypot(x - player[1], y - player[2]) < Math.sqrt(player[3]) * .17 + .18) {
              state.food[index]++; player[3] = Math.min(60, player[3] + 1); player[4]++
            }
          })
        }
        for (const larger of state.players) for (const smaller of state.players) {
          if (larger !== smaller && larger[3] > smaller[3] * 1.4 && Math.hypot(larger[1] - smaller[1], larger[2] - smaller[2]) < Math.sqrt(larger[3]) * .17) {
            larger[3] = Math.min(60, larger[3] + Math.floor(smaller[3] / 2)); larger[4] += 5
            smaller[1] = larger[1] > 0 ? -8 : 8; smaller[2] = larger[2] > 0 ? -8 : 8; smaller[3] = 6
          }
        }
        state.tick++
        if (current) try { rooms.send([state.tick, state.players, state.food]) } catch (error) { setNotice(String(error)) }
      }
      setScore(state.players.find(p => p[0] === self)?.[4] ?? 0)
      setPlayers(state.players.length)
      setBoard(state.players.map((p, index) => ({ id: p[0], index, score: p[4] })))
    }, 100)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
    let renderer, frame = 0, lastWidth = 0, lastHeight = 0
    const scene = new THREE.Scene(), geometry = new THREE.SphereGeometry(1, 24, 16)
    scene.background = new THREE.Color('#101e28')
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 100)
    camera.position.set(0, 24, 17); camera.lookAt(0, 0, 0)
    const ambient = new THREE.HemisphereLight(0xffffff, 0x244251, 2.4); scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(4, 14, 8); scene.add(sun)
    const grid = new THREE.GridHelper(20, 20, 0x486577, 0x243d4c); scene.add(grid)
    const materials = COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: .3, metalness: .15 }))
    const dots = Array.from({ length: 24 }, () => { const mesh = new THREE.Mesh(geometry, materials[1]); mesh.scale.setScalar(.13); scene.add(mesh); return mesh })
    const cells = new Map()
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true, alpha: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      const render = () => {
        const width = canvas.current.clientWidth, height = canvas.current.clientHeight
        if (width && height && (width !== lastWidth || height !== lastHeight)) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); lastWidth = width; lastHeight = height }
        const state = world.current, ids = state.players.map(p => p[0])
        for (const [id, mesh] of cells) if (!ids.includes(id)) { scene.remove(mesh); cells.delete(id) }
        state.players.forEach((player, index) => {
          let mesh = cells.get(player[0])
          if (!mesh) { mesh = new THREE.Mesh(geometry, materials[index % 4]); mesh.position.set(player[1], .4, player[2]); cells.set(player[0], mesh); scene.add(mesh) }
          const size = Math.sqrt(player[3]) * .17
          mesh.position.lerp(new THREE.Vector3(player[1], size * .7, player[2]), .2)
          mesh.scale.set(size, size * .7, size)
        })
        dots.forEach((mesh, i) => { const [x, y] = foodPosition(i, state.food[i]); mesh.position.set(x, .15, y) })
        renderer.render(scene, camera)
        frame = requestAnimationFrame(render)
      }
      render()
    } catch (error) { setGraphicsError('3D rendering is unavailable: ' + String(error)) }
    return () => { cancelAnimationFrame(frame); renderer?.dispose(); geometry.dispose(); materials.forEach(m => m.dispose()); grid.geometry.dispose(); grid.material.dispose() }
  }, [])
  const connect = async role => {
    setBusy(true); setNotice('Waiting for your permission…')
    try {
      const result = role === 'host' ? await rooms.host() : await rooms.join(invite.trim())
      if (!result) setNotice('Multiplayer was not allowed. You can keep practicing.')
      else canvas.current.focus()
    } catch (error) { setNotice(String(error)) } finally { setBusy(false) }
  }
  const keys = useRef(new Set())
  const keyboard = (event, down) => {
    const key = event.key.toLowerCase()
    if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) return
    event.preventDefault()
    if (down) keys.current.add(key); else keys.current.delete(key)
    const has = (...names) => names.some(name => keys.current.has(name)) ? 1 : 0
    input.current = [has('d', 'arrowright') - has('a', 'arrowleft'), has('s', 'arrowdown') - has('w', 'arrowup')]
  }
  const route = session?.peers.map(p => p.route === 'connecting' ? 'connecting' : p.route + ' · ' + Math.round(p.latencyMs ?? 0) + ' ms').join(' / ')
  const self = session?.self ?? 'practice'
  return <section className="orbit-game">
    <style>{\`
      .orbit-game{color:#edf5fa;background:#101e28;border:1px solid #344d5d;border-radius:18px;overflow:hidden;font:13px/1.5 system-ui;container-type:inline-size;color-scheme:dark}
      .orbit-game *{box-sizing:border-box}
      .orbit-game button,.orbit-game input{font:inherit;border:1px solid #527083;border-radius:9px;min-height:42px}
      .orbit-game button{background:#243e50;color:#f4faff;padding:9px 14px;cursor:pointer;font-weight:650}
      .orbit-game button:hover:not(:disabled){background:#33566c;border-color:#89b2c7}
      .orbit-game button:disabled{opacity:.5;cursor:not-allowed}
      .orbit-game button:focus-visible,.orbit-game input:focus-visible,.orbit-game canvas:focus-visible{outline:3px solid #62e5be;outline-offset:-3px}
      .orbit-game input{background:#0d1922;color:#f1f8fc;padding:9px 12px;min-width:0}
      .orbit-game input::placeholder{color:#afc3ce;opacity:1}
      .orbit-game .og-header{padding:18px 20px;display:flex;gap:12px;justify-content:space-between;align-items:center;border-bottom:1px solid #2d4554}
      .orbit-game h1{font-size:22px;letter-spacing:-.6px;margin:0}
      .orbit-game .og-eyebrow{font-size:10px;letter-spacing:1.8px;font-weight:750;color:#8fe9ce;text-transform:uppercase}
      .orbit-game .og-muted{color:#b7cbd6}
      .orbit-game .og-total{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
      .orbit-game .og-total strong{font-size:27px;line-height:1.1;display:block;color:#8fe9ce}
      .orbit-game canvas{display:block;width:100%;height:280px;outline-offset:-3px}
      .orbit-game .og-board{margin:0 16px 16px;padding:12px;background:#152833;border:1px solid #385362;border-radius:12px}
      .orbit-game .og-board-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px}
      .orbit-game .og-board-title strong{font-size:11px;letter-spacing:1.3px;text-transform:uppercase}
      .orbit-game .og-rows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
      .orbit-game .og-row{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;background:#0e202b;border-radius:7px;border:1px solid transparent}
      .orbit-game .og-row.og-self{border-color:#547c7d}
      .orbit-game .og-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 3px #ffffff0c}
      .orbit-game .og-you{font-size:10px;background:#28493f;color:#a4f5d9;border-radius:4px;padding:1px 5px;font-weight:750}
      .orbit-game .og-points{margin-left:auto;font-weight:750;font-variant-numeric:tabular-nums}
      .orbit-game .og-body{padding:0 16px 16px}
      .orbit-game .og-controls{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:12px 0 18px}
      .orbit-game .og-pad{display:flex;gap:6px}
      .orbit-game .og-pad button{width:44px;height:44px;padding:0;font-size:22px;touch-action:none;user-select:none}
      .orbit-game .og-primary{background:#69e2bd;color:#0d2923;border-color:#69e2bd}
      .orbit-game .og-primary:hover:not(:disabled){background:#91efd2;color:#0d2923}
      .orbit-game .og-room{border-top:1px solid #344d5d;padding-top:16px}
      .orbit-game .og-join{display:flex;gap:8px;margin-top:10px}
      .orbit-game .og-join input{flex:1;width:0}
      .orbit-game .og-status{margin:14px 0 0;padding:10px 12px;border-radius:8px;background:#152833;color:#c5d9e4;overflow-wrap:anywhere}
      .orbit-game .og-invite{display:block;width:100%;margin-top:6px}
      @container(max-width:380px){.orbit-game .og-header{padding:14px}.orbit-game .og-rows{grid-template-columns:1fr}.orbit-game .og-controls{gap:8px}.orbit-game h1{font-size:20px}.orbit-game .og-row{padding:7px 10px}}
    \`}</style>
    <header className="og-header">
      <div><div className="og-eyebrow">Eat · grow · outlast</div><h1>Orbit arena</h1><div className="og-muted">{session ? (session.role === 'host' ? 'Hosting' : 'Playing') : 'Local practice'} · {players}/4 players</div></div>
      <div className="og-total" aria-label={'Your score: ' + score}><strong>{score}</strong><span className="og-muted">{score === 1 ? 'point' : 'points'}</span></div>
    </header>
    <canvas ref={canvas} tabIndex={0} aria-label="Game arena. Use arrow keys or W A S D to move. Eat golden dots to grow." onKeyDown={e => keyboard(e, true)} onKeyUp={e => keyboard(e, false)} onBlur={() => { keys.current.clear(); input.current = [0, 0] }} />
    {graphicsError && <p role="alert" style={{padding:'0 16px',color:'#ffd887'}}>{graphicsError}</p>}
    <section className="og-board" aria-label="Live scoreboard">
      <div className="og-board-title"><strong>Live scoreboard</strong><span className="og-muted">{session ? 'Room scores' : 'Practice run'}</span></div>
      <div className="og-rows">
        {board.map(player => <div key={player.id} className={'og-row' + (player.id === self ? ' og-self' : '')}>
          <span className="og-dot" style={{background:'#' + COLORS[player.index % 4].toString(16).padStart(6,'0')}} />
          <span>Player {player.index + 1}</span>{player.id === self && <span className="og-you">You</span>}
          <span className="og-points" aria-label={player.score + ' points'}>{player.score}</span>
        </div>)}
        {!board.length && <span className="og-muted">Waiting for the host’s first update…</span>}
      </div>
    </section>
    <div className="og-body">
      <p style={{margin:'0 0 4px'}}>Eat the gold dots to grow. Get larger than your friends.</p>
      <div className="og-controls">
        <div className="og-pad" role="group" aria-label="Movement controls">
          {[['←', -1, 0], ['↑', 0, -1], ['↓', 0, 1], ['→', 1, 0]].map(([label, x, y]) => <button key={label} aria-label={'Move ' + ({'←':'left','↑':'up','↓':'down','→':'right'})[label]} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); input.current = [x, y] }} onPointerUp={() => input.current = [0, 0]} onPointerCancel={() => input.current = [0, 0]} onLostPointerCapture={() => input.current = [0, 0]} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); input.current = [x, y] } }} onKeyUp={() => input.current = [0, 0]} onBlur={() => input.current = [0, 0]}>{label}</button>)}
        </div>
        <span className="og-muted">Hold to move<br/>or focus arena + WASD / arrows</span>
      </div>
      <div className="og-room">
        {!session ? <><button className="og-primary" disabled={busy} onClick={() => connect('host')}>Host a game</button><div className="og-join"><input aria-label="Game invitation" value={invite} onChange={e => setInvite(e.target.value)} placeholder="Paste a game invitation" /><button disabled={busy || !invite.trim()} onClick={() => connect('guest')}>Join</button></div></> : <>
          {session.invitation && <label>Invite friends using this same extension version<input className="og-invite" ref={invitationField} aria-label="Your game invitation" readOnly value={session.invitation} onFocus={e => e.target.select()} /><button onClick={() => { invitationField.current.focus(); invitationField.current.select() }} style={{marginTop:8}}>Select invitation to copy</button></label>}
          {!session.relayAvailable && <p style={{color:'#ffd887'}}>No relay available. Some networks may not connect.</p>}
          <p className="og-muted">{route || 'Waiting for friends…'}</p><button onClick={async () => { try { await rooms.leave() } catch (e) { setNotice(String(e)) } }}>Leave game</button>
        </>}
        <p role="status" className="og-status">{notice}</p>
      </div>
    </div>
  </section>
}
`
