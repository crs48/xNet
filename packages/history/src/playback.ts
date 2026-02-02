/**
 * PlaybackEngine - Timeline playback controls
 *
 * Manages play/pause/seek/step/speed for timeline scrubbing.
 * Uses setTimeout for animation scheduling.
 */

import type { PlaybackState } from './types'

export type PlaybackListener = (position: number, state: PlaybackState) => void

export class PlaybackEngine {
  private state: PlaybackState = 'stopped'
  private position = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private speed = 1
  private listeners = new Set<PlaybackListener>()

  constructor(private totalChanges: number) {}

  play(): void {
    if (this.state === 'playing') return
    this.state = 'playing'
    this.scheduleNext()
    this.emit()
  }

  pause(): void {
    this.state = 'paused'
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.emit()
  }

  stop(): void {
    this.state = 'stopped'
    this.position = 0
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.emit()
  }

  seek(index: number): void {
    this.position = Math.max(0, Math.min(index, this.totalChanges - 1))
    this.emit()
  }

  stepForward(): void {
    if (this.position < this.totalChanges - 1) {
      this.position++
      this.emit()
    }
  }

  stepBackward(): void {
    if (this.position > 0) {
      this.position--
      this.emit()
    }
  }

  jumpToStart(): void {
    this.seek(0)
  }

  jumpToEnd(): void {
    this.seek(this.totalChanges - 1)
  }

  setSpeed(speed: number): void {
    this.speed = speed
    if (this.state === 'playing') {
      if (this.timer) clearTimeout(this.timer)
      this.scheduleNext()
    }
  }

  getPosition(): number {
    return this.position
  }

  getState(): PlaybackState {
    return this.state
  }

  getSpeed(): number {
    return this.speed
  }

  setTotalChanges(total: number): void {
    this.totalChanges = total
    if (this.position >= total) {
      this.position = Math.max(0, total - 1)
    }
  }

  onChange(listener: PlaybackListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.listeners.clear()
  }

  private scheduleNext(): void {
    const delay = Math.max(50, 1000 / this.speed)
    this.timer = setTimeout(() => {
      if (this.position >= this.totalChanges - 1) {
        this.pause()
        return
      }
      this.position++
      this.emit()
      if (this.state === 'playing') this.scheduleNext()
    }, delay)
  }

  private emit(): void {
    for (const l of this.listeners) l(this.position, this.state)
  }
}
