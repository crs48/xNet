/**
 * Echo-bleed detection (exploration 0279 — the echo-cancellation spike).
 *
 * The Me/Them attribution trick collapses if far-end audio leaks from the
 * speakers into the microphone: "Them" shows up twice, once attributed to
 * "Me". `getUserMedia({ echoCancellation: true })` removes most of it, but
 * whether the AEC actually converges against a loopback stream varies by
 * OS/device — so instead of trusting it, the session MEASURES it and the
 * recorder UI can warn ("echo detected — wear headphones").
 *
 * Method: normalized cross-correlation between the mic and system-audio
 * windows over a plausible acoustic-delay range. Pure DSP, no deps, cheap
 * enough to run on a few windows per minute.
 */

export interface BleedOptions {
  /** Shared sample rate of both windows (resample upstream). */
  sampleRate: number
  /** Max speaker→mic acoustic delay probed, ms. Default 250. */
  maxLagMs?: number
  /** Correlation above this counts as bleed. Default 0.5. */
  threshold?: number
}

export interface BleedResult {
  /** Peak normalized cross-correlation in [0, 1]. */
  correlation: number
  /** Lag (ms) at the peak — how far the mic copy trails the system audio. */
  lagMs: number
  /** correlation ≥ threshold. */
  bleeding: boolean
}

const mean = (xs: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < xs.length; i++) sum += xs[i]
  return xs.length > 0 ? sum / xs.length : 0
}

/**
 * Detect far-end bleed: does `mic` contain a delayed copy of `system`?
 * Windows should cover the same wall-clock span (a second or two of audio).
 */
export function detectChannelBleed(
  mic: Float32Array,
  system: Float32Array,
  options: BleedOptions
): BleedResult {
  const { sampleRate } = options
  const threshold = options.threshold ?? 0.5
  const maxLag = Math.round(((options.maxLagMs ?? 250) / 1000) * sampleRate)

  const n = Math.min(mic.length, system.length)
  if (n === 0) return { correlation: 0, lagMs: 0, bleeding: false }

  // Center both signals so DC offset doesn't fake correlation.
  const micMean = mean(mic.subarray(0, n))
  const sysMean = mean(system.subarray(0, n))

  let sysEnergy = 0
  for (let i = 0; i < n; i++) {
    const s = system[i] - sysMean
    sysEnergy += s * s
  }
  if (sysEnergy === 0) return { correlation: 0, lagMs: 0, bleeding: false }

  let bestCorr = 0
  let bestLag = 0
  // Probe positive lags only: the mic copy always TRAILS the system stream
  // (sound has to leave the speaker and reach the mic).
  const lagStep = Math.max(1, Math.floor(sampleRate / 8000)) // ≤8k probes/lag range
  for (let lag = 0; lag <= maxLag && lag < n; lag += lagStep) {
    let dot = 0
    let micEnergy = 0
    for (let i = 0; i + lag < n; i++) {
      const m = mic[i + lag] - micMean
      const s = system[i] - sysMean
      dot += m * s
      micEnergy += m * m
    }
    if (micEnergy === 0) continue
    const corr = Math.abs(dot) / Math.sqrt(micEnergy * sysEnergy)
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  return {
    correlation: bestCorr,
    lagMs: Math.round((bestLag / sampleRate) * 1000),
    bleeding: bestCorr >= threshold
  }
}
