---
'@xnetjs/core': patch
'@xnetjs/plugins': patch
'@xnetjs/runtime': patch
---

docs(exploration): renumber Effect adoption doc 0300 -> 0303 (collision)

Exploration numbers collided across parallel worktrees again (0301 gotcha):
0300 was already taken by RUNNING_AN_XNET_HUB_ON_A_RASPBERRY_PI (#477) and
0301/0302 are claimed. Renames the doc and updates the exploration-number
references in code comments and CLAUDE.md; no code change (empty changeset).

Signed-off-by: xNet Test <test@xnet.dev>
