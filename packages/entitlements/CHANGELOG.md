# @xnetjs/entitlements

## 0.0.2

### Patch Changes

- [#319](https://github.com/crs48/xNet/pull/319) [`2e7e4c7`](https://github.com/crs48/xNet/commit/2e7e4c797d4b1411e18e2a51a84ec87d8ea48156) Thanks [@crs48](https://github.com/crs48)! - Fix the managed-AI plan model IDs to match OpenRouter's catalog: the Anthropic
  models use a dotted version (`anthropic/claude-haiku-4.5`,
  `anthropic/claude-sonnet-4.6`, `anthropic/claude-opus-4.8`), not a dashed one.
  The previous dashed IDs (`…-4-5` / `…-4-6` / `…-4-8`) don't exist upstream, so a
  tenant on a default Anthropic model got a model-not-found error. The OpenAI and
  Google IDs were already correct.
