/**
 * Renderer typing for the meeting-capture preload bridge (exploration 0279).
 * The implementation lives in `src/preload/index.ts` (`window.xnetMeetings`);
 * the contract type is owned by the shared recorder core in @xnetjs/views —
 * keep the preload in sync with `MeetingsBridge`.
 */

declare global {
  interface Window {
    xnetMeetings?: import('@xnetjs/views').MeetingsBridge
  }
}

export {}
