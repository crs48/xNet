---
'@xnetjs/data': patch
'@xnetjs/react': patch
---

docs(exploration): renumber database views 0337 -> 0339 (collision with OpenClaw 0337)

Two explorations claimed 0337; the OpenClaw agent-audit doc's first
commit (18:05:21) predates the database-views doc (18:07:01), so per the
collision rule the database-views doc renumbers. Comment references in
the code it introduced follow. No behavior change (empty changeset).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

Signed-off-by: xNet Test <test@xnet.dev>
