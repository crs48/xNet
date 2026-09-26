/**
 * Slug → hero art for every blog post.
 *
 * Each essay's art-directed hero is an inline SVG `*Art.astro` component. The
 * same component is rendered three ways, so the mapping lives here rather than
 * in any one consumer:
 *   - the post's own hero band (`*Hero.astro` imports its Art directly);
 *   - the blog-index preview card (`pages/blog/index.astro`);
 *   - the post's social-card PNG (`pages/blog/og/[slug].png.ts`), which
 *     rasterises the SVG at build time so link unfurls on Slack, X, iMessage
 *     and the rest — none of which accept SVG for `og:image` — show the
 *     essay's picture instead of the site-wide screenshot.
 *
 * Every post must have an entry: the OG endpoint fails the build for a slug
 * it cannot draw, rather than quietly falling back to the generic image.
 */
import BallotArt from '../components/blog/BallotArt.astro'
import BoardArt from '../components/blog/BoardArt.astro'
import BrickArt from '../components/blog/BrickArt.astro'
import DisguiseArt from '../components/blog/DisguiseArt.astro'
import DoorHouseArt from '../components/blog/DoorHouseArt.astro'
import DustArt from '../components/blog/DustArt.astro'
import ForestArt from '../components/blog/ForestArt.astro'
import HookArt from '../components/blog/HookArt.astro'
import LeverArt from '../components/blog/LeverArt.astro'
import MycelialArt from '../components/blog/MycelialArt.astro'
import PirateArt from '../components/blog/PirateArt.astro'
import StarArt from '../components/blog/StarArt.astro'
import LoomArt from '../components/blog/LoomArt.astro'
import TableWallArt from '../components/blog/TableWallArt.astro'
import TillerArt from '../components/blog/TillerArt.astro'
import TimeoutArt from '../components/blog/TimeoutArt.astro'
import VaultArt from '../components/blog/VaultArt.astro'
import WeightsArt from '../components/blog/WeightsArt.astro'
import WorkshopArt from '../components/blog/WorkshopArt.astro'
import RingsArt from '../components/blog/RingsArt.astro'
import PalimpsestArt from '../components/blog/PalimpsestArt.astro'
import RecordArt from '../components/blog/RecordArt.astro'
import HarvestArt from '../components/blog/HarvestArt.astro'
import MeterArt from '../components/blog/MeterArt.astro'
import HundredYearArt from '../components/blog/HundredYearArt.astro'

export type HeroArtComponent = typeof PirateArt

export const heroArt: Record<string, HeroArtComponent> = {
  'atoms-for-the-ballot': BallotArt,
  'the-hundred-year-machine': HundredYearArt,
  'the-door-inside-the-house': DoorHouseArt,
  'the-table-and-the-wall': TableWallArt,
  'the-matchmaker-and-the-meter': MeterArt,
  'the-harvest-you-can-count': HarvestArt,
  'rig-the-game-or-play': BoardArt,
  'the-worlds-greatest-record-store': RecordArt,
  palimpsest: PalimpsestArt,
  'tree-rings': RingsArt,
  'people-in-disguise': DisguiseArt,
  'clutch-power': BrickArt,
  'weights-you-can-hold': WeightsArt,
  timeout: TimeoutArt,
  'the-vault-and-the-view': VaultArt,
  'the-workshop-and-the-walled-garden': WorkshopArt,
  'hand-on-the-tiller': TillerArt,
  'the-tip-of-the-hook': HookArt,
  'a-great-pirate-age': PirateArt,
  'data-should-work-like-soil': MycelialArt,
  'the-gentlest-furnace': StarArt,
  'the-right-to-say-no': LeverArt,
  'the-desert-that-feeds-the-forest': DustArt,
  'the-forest-and-the-field': ForestArt,
  'the-loom-you-can-read': LoomArt
}
