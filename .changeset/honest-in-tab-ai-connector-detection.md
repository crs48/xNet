---
'@xnetjs/plugins': minor
---

Connector detection now reports the in-tab AI tiers as available only when they
can actually run, fixing a chat composer that stayed disabled with no
explanation. `webllm` is gated on a new `ConnectorEnv.hasWebLLMEngine` probe (in
addition to WebGPU) so it's never advertised without a host-supplied engine, and
the default `prompt-api` probe now reads `LanguageModel.availability()` and
treats only `'available'` as ready (mere API presence with a `'downloadable'`
model no longer counts). Adds `promptApiAvailability()` (raw state, for offering
a download gesture) and `downloadPromptApiModel()` (gesture-driven, monitored
download), plus the `PromptApiAvailability` and `LanguageModelMonitor` types.
