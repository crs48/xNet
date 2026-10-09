/** Generated cover artwork shared by post heroes, index cards and social images. */
export interface BlogArt {
  src: string
  srcSet: string
  alt: string
  width: number
  height: number
}

const descriptions: Record<string, string> = {
  'atoms-for-the-ballot': 'A hand places a folded paper ballot into a wooden ballot box.',
  'the-hundred-year-machine': 'A well-used treadle sewing machine stands in a sunlit room.',
  'the-door-inside-the-house':
    'A person waits outside a closed door beside a window into their study.',
  'the-table-and-the-wall':
    'A carpenter works on a wooden table beside an opening onto a street market.',
  'the-matchmaker-and-the-meter':
    'A friend introduces two people in a lively neighborhood dance hall.',
  'the-harvest-you-can-count':
    'A measured sheaf of grain and a basket of varied produce share a garden table.',
  'rig-the-game-or-play':
    'An abandoned board game has most of its houses and coins piled in one corner.',
  'the-worlds-greatest-record-store':
    'People browse and share records in a warmly lit neighborhood record shop.',
  palimpsest: 'Faint geometric drawings show through layers of an old parchment manuscript.',
  'tree-rings': 'The growth rings of an old fallen tree are surrounded by moss and ferns.',
  'people-in-disguise':
    'Musicians play distinct acoustic instruments together in a warm wooden room.',
  'clutch-power': 'Hands connect colorful construction bricks beside a small model bridge.',
  'weights-you-can-hold':
    'A hand rests on a portable drive beside a laptop, camera, book and record.',
  timeout: 'A comfortable chair and blanket wait beside a window overlooking a quiet garden.',
  'the-vault-and-the-view':
    'Three open windows look onto one garden beside an archive of personal papers.',
  'the-workshop-and-the-walled-garden':
    'An open workshop with tools and a model on its workbench leads into a garden.',
  'hand-on-the-tiller': 'A hand steers a wooden sailboat with its tiller over a calm blue sea.',
  'the-tip-of-the-hook':
    'A small iceberg peak reveals a much larger translucent body beneath the water.',
  'a-great-pirate-age': 'A small sailing ship makes its way between sunlit islands.',
  'data-should-work-like-soil': 'A thriving forest above a cutaway of soil, roots and mycelium.',
  'the-gentlest-furnace': 'A luminous golden star against a deep blue field of stars.',
  'the-right-to-say-no': 'A person carries a box through an open door into a sunlit meadow.',
  'the-desert-that-feeds-the-forest':
    'A plume of desert dust crosses the ocean toward a green rainforest.',
  'the-forest-and-the-field': 'Orderly crop rows meet a diverse forest along a winding path.',
  'the-loom-you-can-read':
    'A wooden handloom exposes the threads and mechanism that weave its cloth.'
}

/** Fail the build when a post has no cover instead of silently hiding it. */
export const blogArt = (slug: string): BlogArt => {
  const alt = descriptions[slug]
  if (!alt) throw new Error(`No blog cover registered for "${slug}"`)
  const src = `/blog/covers/${slug}.webp`
  return {
    src,
    srcSet: `/blog/covers/${slug}-800.webp 800w, ${src} 1600w`,
    alt,
    width: 1600,
    height: 800
  }
}
