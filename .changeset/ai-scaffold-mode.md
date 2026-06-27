---
'@xnetjs/plugins': minor
---

AI assist now defaults to a "scaffold" mode that keeps you the author — the model
proposes and cites, you write and own — as a guard against LLM deskilling
(Humane Internet Charter §Agency). Every assistant turn is tagged with
`ai-generated` provenance and the mode it was produced under, and a new
`composeAssistSystemPrompt` helper appends the cognitive-debt guard in scaffold
mode. `draft` mode (the model writes finished prose) must be opted into
explicitly via `assistMode: 'draft'`.
