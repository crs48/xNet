# Desktop chat polish

Implement the 2026-10-23 visual references in the existing local prototype.
Keep all changes local: no commits, pushes, merges or deployments.

Use a slate-gray navigation surface, white content, subtle shadows and compact
controls. Preserve xNet's identity and existing chat/group/agent workflows.

- [x] Consolidate dialogs, tabs, menus, popovers and tooltips on shared Base UI primitives.
- [x] Refine the shell, message typography, composer and layered surfaces.
- [x] Add device-local pinned chats, read markers, recent ordering and clear activity summaries.
- [x] Surface actual agent/delivery state and richer message previews in the sidebar.
- [x] Fix focus restoration, tab navigation and the thread overlay at narrow widths.
- [x] Improve history focus retention and restrained incoming-message announcements.
- [x] Exercise the real Electron app, including pins, unread state, keyboard menus, tabs, zoom and restart persistence.
- [x] Run meaningful logic tests, affected typechecks, lint, build and graph update; record evidence.

Pins and read markers are personal UI preferences on this device. This pass does
not change peer permissions, replicate media, introduce presence claims, or add
Git concepts to ordinary conversations. Existing extension development remains
available through its own chat view.

Evidence: `output/chat-shell-polish/verification.md`. Production build, same-origin restart, keyboard behavior, and native 200% zoom are verified. Full Electron renderer typechecking retains four unrelated baseline errors, recorded in the report.
