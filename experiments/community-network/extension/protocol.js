const registryOrigin = 'http://127.0.0.1:4380'
const isContentId = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

export function playbackRequest(message, sender, extensionId, playerUrl) {
  if (
    !message ||
    message.op !== 'play' ||
    !isContentId(message.id) ||
    sender?.id !== extensionId ||
    sender.url !== `${playerUrl}#${message.id}` ||
    !Number.isInteger(sender.frameId) ||
    sender.frameId <= 0
  ) {
    throw new Error('Playback request rejected.')
  }
  let page
  try {
    page = new URL(sender.tab?.url)
  } catch {
    throw new Error('Open this media on the paired registry first.')
  }
  if (
    page.origin !== registryOrigin ||
    page.username ||
    page.password ||
    page.pathname !== `/watch/${message.id}`
  ) {
    throw new Error('Open this media on the paired registry first.')
  }
  return { op: 'play', id: message.id }
}

export function playbackResponse(response, id) {
  if (response?.ok !== true) {
    throw new Error(
      typeof response?.error === 'string'
        ? response.error
        : 'Desktop did not return a playback session.'
    )
  }
  let address
  try {
    address = new URL(response.result?.url)
  } catch {
    throw new Error('Desktop returned an invalid playback address.')
  }
  const item = response.result?.item?.record?.payload
  if (
    !isContentId(id) ||
    address.protocol !== 'http:' ||
    address.hostname !== '127.0.0.1' ||
    !address.port ||
    address.username ||
    address.password ||
    address.hash ||
    address.pathname !== `/media/${id}` ||
    [...address.searchParams].length !== 1 ||
    !isContentId(address.searchParams.get('ticket')) ||
    !item ||
    !['image', 'video', 'audio'].includes(item.kind) ||
    typeof item.title !== 'string'
  ) {
    throw new Error('Desktop returned an unexpected playback session.')
  }
  return { url: address.href, title: item.title, kind: item.kind }
}
