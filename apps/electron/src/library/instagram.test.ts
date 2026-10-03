import { expect, it } from 'vitest'
import { parseInstagramPage } from './instagram'

const embed = (body: string, kind = 'reel') => `
  <a class="EmbeddedMedia" href="https://www.instagram.com/${kind}/abc123/">
    <img class="EmbeddedMediaImage" src="https://images.example/post.jpg?x=1&amp;y=2">
  </a>
  <span class="UsernameText">example.creator</span>
  <img class="Avatar" src="https://images.example/avatar.jpg">
  ${body}
`

it('keeps full written captions, line breaks, entities and hashtags without comments or scripts', () => {
  const tail = 'late phrase '.repeat(1000)
  const result = parseInstagramPage(
    embed(`<div class="Caption">
    <a class="CaptionUsername">example.creator</a><br><br>
    A &quot;quote&quot; &amp; &#x1F33F; &#039;note&#039;<br>Second line
    <a href="/explore/tags/example/">#example</a>${tail}
    <div class="CaptionComments">View all 123 comments</div><script>throw new Error('never execute')</script>
  </div>`),
    'abc123'
  )
  expect(result.provider).toBe('instagram-embed/1')
  expect(result.author).toBe('example.creator')
  expect(result.thumbnailUrl).toBe('https://images.example/post.jpg?x=1&y=2')
  expect(result.description).toContain('A "quote" & 🌿 \'note\'\nSecond line')
  expect(result.description).toContain('#example' + tail.trim())
  expect(result.description).not.toContain('View all')
  expect(result.description).not.toContain('never execute')
  expect(result.description).not.toContain('example.creator')
  expect(result.fields.description.state).toBe('complete')
  expect(result.fields.captions.state).toBe('unavailable')
  expect(result.tracks).toBeUndefined()
})

it('uses the post poster for photos and carousels and preserves an explicitly empty caption', () => {
  const result = parseInstagramPage(
    embed('<div class="Caption"><a class="CaptionUsername">example.creator</a></div>', 'p'),
    'abc123'
  )
  expect(result.thumbnailUrl).toContain('post.jpg')
  expect(result.description).toBe('')
  expect(result.title).toBe('Instagram post by example.creator')
  expect(result.fields.description.state).toBe('complete')
})

it('marks an absent caption as unavailable and never substitutes an avatar', () => {
  const result = parseInstagramPage(embed(''), 'abc123')
  expect(result.fields.description.state).toBe('unavailable')
  expect(() =>
    parseInstagramPage(embed('').replace(/<img class="EmbeddedMediaImage"[^>]*>/, ''), 'abc123')
  ).toThrow('no post text or thumbnail')
})

it('keeps Open Graph fallback coverage partial and handles quotes in attributes', () => {
  const result = parseInstagramPage(
    `
    <meta content="https://www.instagram.com/creator/reel/abc123/" property="og:url">
    <meta property='og:title' content='Creator on Instagram: &quot;A title&quot;'>
    <meta property="og:description" content="It's a public preview &amp; more">
    <meta property="og:image" content="https://images.example/post.jpg">
  `,
    'abc123'
  )
  expect(result.author).toBe('Creator')
  expect(result.description).toBe("It's a public preview & more")
  expect(result.fields.description.state).toBe('partial')
  expect(result.provider).toBe('instagram-page/1')
})

it('rejects login pages, unrelated posts and an external canonical host', () => {
  for (const html of [
    '<meta property="og:title" content="Instagram"><meta property="og:image" content="https://images.example/logo.jpg">Log in',
    embed('<div class="Caption">Another post</div>').replace('abc123', 'another'),
    '<meta property="og:url" content="https://evil.example/p/abc123/"><meta property="og:description" content="Wrong host">'
  ])
    expect(() => parseInstagramPage(html, 'abc123')).toThrow()
})
