---
'@xnetjs/data': minor
---

Add composer-resolved link previews (exploration 0295): a new optional
`linkPreviews` json field on `ChatMessageSchema` and `CommentSchema`, plus the
`MessageLinkPreview` type with `isMessageLinkPreview`, `sanitizeLinkPreviews`,
and `MAX_LINK_PREVIEWS_PER_MESSAGE` helpers. Previews are resolved once by the
author's client and stored with the message — readers render the snapshot and
never fetch the URL.
