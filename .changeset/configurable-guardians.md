---
'@xnetjs/react': minor
---

Make guardian (social) recovery configurable and threshold-aware (exploration 0243).
Settings lets you choose how many guardians (2–7) and how many are needed; the onboarding
recovery screen now reads the required threshold from the pasted share codes and only
enables recovery once you have enough (rather than assuming 2-of-3), flagging unrecognized
codes as you paste.
