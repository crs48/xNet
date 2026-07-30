---
'@xnetjs/views': minor
---

Database file cells open a full-screen attachment lightbox. Clicking a file chip in any cell now opens the attachment in a viewer with prev/next paging, download, and Escape/backdrop close. Images render inline, video and audio get native controls, and other file types show a download card. The new `AttachmentLightboxProvider` mounts one viewer per surface.
