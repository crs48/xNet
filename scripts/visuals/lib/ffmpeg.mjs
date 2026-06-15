/**
 * ffmpeg helpers -- the single binary covers BOTH jobs we'd otherwise add npm
 * deps for: encoding interaction clips (Phase 4) and image diffing (Phase 3).
 *
 * Diffing via SSIM + `blend=difference` is coarser than pixelmatch but needs no
 * dependency, runs anywhere ffmpeg does, and is plenty for "did this element
 * change at all" + a human-readable diff image.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let statsSeq = 0

function run(args) {
  return execFileSync('ffmpeg', ['-hide_banner', '-y', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

/** Encode a Playwright .webm into an embeddable gif + mp4 + poster png. */
export function encodeClip(webm, outBase, { fps = 12, width = 960 } = {}) {
  const palette = `${outBase}.palette.png`
  const scale = `scale=${width}:-1:flags=lanczos`
  // Two-pass palette = sharp colors at small size.
  run(['-i', webm, '-vf', `fps=${fps},${scale},palettegen=stats_mode=diff`, palette])
  run([
    '-i',
    webm,
    '-i',
    palette,
    '-lavfi',
    `fps=${fps},${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    `${outBase}.gif`
  ])
  // mp4: small, high quality, web-playable.
  run([
    '-i',
    webm,
    '-movflags',
    '+faststart',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    `${scale}`,
    `${outBase}.mp4`
  ])
  // poster: first frame.
  run(['-i', webm, '-vf', `${scale}`, '-frames:v', '1', `${outBase}.poster.png`])
  return { gif: `${outBase}.gif`, mp4: `${outBase}.mp4`, poster: `${outBase}.poster.png` }
}

/**
 * Structural similarity of two PNGs in [0,1] (1 = identical). The candidate is
 * scaled to the baseline's dimensions first, so a size change reads as a
 * (large) difference rather than a crash.
 */
export function ssim(baseline, candidate) {
  // The SSIM summary goes to stderr (not returned by execFileSync on success),
  // so route per-frame stats to a temp file and read the `All:` value back.
  const stats = join(tmpdir(), `xnet-ssim-${process.pid}-${statsSeq++}.log`)
  try {
    run([
      '-i',
      baseline,
      '-i',
      candidate,
      '-lavfi',
      `[1:v][0:v]scale2ref[c][b];[b][c]ssim=stats_file=${stats}`,
      '-f',
      'null',
      '-'
    ])
    const m = readFileSync(stats, 'utf8').match(/All:([0-9.]+)/)
    return m ? Number(m[1]) : NaN
  } catch {
    return NaN
  } finally {
    try {
      rmSync(stats)
    } catch {}
  }
}

/** Write an amplified difference image highlighting what changed. */
export function diffImage(baseline, candidate, outPath) {
  run([
    '-i',
    baseline,
    '-i',
    candidate,
    '-filter_complex',
    '[1:v][0:v]scale2ref[c][b];[b][c]blend=all_mode=difference,eq=contrast=3.0:brightness=0.05',
    '-frames:v',
    '1',
    outPath
  ])
  return outPath
}

export function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return existsSync('/usr/bin/ffmpeg')
  }
}
