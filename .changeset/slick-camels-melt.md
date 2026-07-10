---
'@xnetjs/sync': patch
---

chore(dead-code): drive the fallow count back to zero for the new ratchet gate (0294)

The audit step's guaranteed failure had masked the dead-code ratchet for
weeks (it ran after --fail-on-issues exited 1), letting main drift to 42
standing issues — which the reworked ratchet-only lane immediately
caught on its first branch dispatch. Fixes: declare the CLI/external
entry points fallow can't see (cloud ops scripts, changeset tools, the
native-messaging host) as dynamicallyLoaded; ignore @capacitor/android/
ios (consumed by the capacitor CLI, not imports); list fast-check as a
real devDependency of @xnetjs/sync; un-export 22 symbols nothing
imports; delete three fully dead site data consts. fallow dead-code is
clean, the regression baseline is regenerated at zero, and the site
still builds (118 pages).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

Signed-off-by: xNet Test <test@xnet.dev>
