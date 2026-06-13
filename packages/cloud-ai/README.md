# @xnetjs/cloud-ai

Managed AI gateway for the fleet. See explorations 0148/0175/0176.

An OpenAI-compatible client, a budget-guarded + metered wrapper, the usage→billing bridge, and a sandboxed agent-safety harness. The whole package is testable with **no provider keys**.

## Features

- **Gateway client** -- `GatewayClient` (`ChatGateway`): an OpenAI-compatible chat client, with `GatewayError` and `ChatRequest` / `ChatResult` / `TokenUsage` types
- **Metering** -- `meterUsage`: turns token usage into a billable event for `@xnetjs/cloud-billing`
- **Budget hard-stop** -- `MeteredGateway`: wraps a gateway with per-tenant budget enforcement (throws `BudgetExceededError`) and meters every call
- **Agent-safety harness** -- `AgentRunner`: a sandboxed multi-step agent loop with a `PreToolUse` hook that can deny tool calls (`PreToolDecision` / `Denial`)

## Usage

```typescript
import { GatewayClient, MeteredGateway } from '@xnetjs/cloud-ai'

const gateway = new GatewayClient({ baseUrl, apiKey })

const metered = new MeteredGateway(gateway, {
  ledger, // @xnetjs/cloud-billing UsageLedger
  budgetUsd: 5 // per-tenant hard stop
})

const result = await metered.chat({ tenantId, model, messages })
```

## Modules

| Module               | Description                                  |
| -------------------- | -------------------------------------------- |
| `gateway.ts`         | OpenAI-compatible chat client                |
| `metering.ts`        | Usage → billing event bridge                 |
| `metered-gateway.ts` | Budget hard-stop + metering wrapper          |
| `agent-runner.ts`    | Sandboxed agent loop with pre-tool-use guard |

## Testing

```bash
pnpm --filter @xnetjs/cloud-ai test
```
