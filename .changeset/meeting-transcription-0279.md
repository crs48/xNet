---
'@xnetjs/data': minor
'@xnetjs/plugins': minor
---

Botless meeting transcription foundations (exploration 0279).

`@xnetjs/data`: new `Meeting@1.0.0` (Yjs notes body, Page-like, private by default) and `MeetingTranscript@1.0.0` (channel-attributed timed segments, FTS full text, engine provenance, opt-in audio blob reference) schemas, plus `MeetingSegment`/`MeetingChannel`/`MeetingTemplateId` types.

`@xnetjs/plugins`: new `systemAudio` module capability (closed by default; gates desktop system-audio capture, renders as a danger consent line) with `isSystemAudioAllowed`/`assertSystemAudio` guards, and a Google Calendar connector (`buildGoogleCalendarConnector`, `detectUpcomingMeeting`) that materializes upcoming events as Meeting nodes.
