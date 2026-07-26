---
'@xnetjs/devkit': minor
'@xnetjs/ui': minor
---

Add the point-and-change substrate from exploration 0399.

`@xnetjs/devkit` gains `resolveLane()` (plus `workspaceOf`, `isKernel`,
`lane3Prompt`) on a new browser-safe `./blast-radius` subpath, and the Lane 3
preconditions `probeDevEnvironment`, `assertEditable`, `previewWorktree`, and
`reviewWorktree`. `openPullRequest()` now opens a **draft** by default — pass
`draft: false` for the previous behaviour.

`@xnetjs/ui` exposes the theme token-override contract (`setThemeToken`,
`clearThemeToken`, `clearThemeTokens`, `readTokenOverrides`,
`applyTokenOverrides`) as plain functions usable outside `ThemeProvider`, and
`useTheme()` gains `tokenOverrides` / `setToken` / `clearToken` / `clearTokens`.
