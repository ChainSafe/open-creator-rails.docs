# Open Creator Rails

**Open Creator Rails (OCR)** is a minimal, verifiable on-chain primitive for
subscription-based access. It maps a subject and a resource to an expiration:

```
(subscriber, asset) → isSubscriptionActive
```

An `Asset` contract represents one subscribable resource. A subject (a `bytes32`
identity derived from an application id plus a wallet address) subscribes by
paying for a number of whole periods through an EIP-2612 permit. Any client —
web, game engine, AI agent, or third-party service — gets the same one-line
answer to "does this subject currently have access?":

```solidity
Asset(asset).isSubscriptionActive(subscriber)
// true  ⇔  not expired  AND  not revoked
```

No roles, no token-balance gating, no off-chain source of truth. On-chain state
is authoritative; the indexer and SDKs are acceleration layers.

> Every statement in this documentation is verified against the contract and SDK
> source. See [Verification Matrix](VERIFICATION.md) for per-claim citations.

---

## What you can build

- **Subscription-gated game content** — Unity SDK checks `isSubscriptionActive`
  to unlock levels, items, or feeds. See [Unity SDK](components/sdk-unity.md) and
  the [Unity getting-started guide](guides/getting-started-unity.md).
- **Web creator platforms ("on-chain Patreon")** — TypeScript SDK + indexer power
  a React app. See the [Pet Shop demo](components/demo.md) and the
  [TypeScript guide](guides/getting-started-typescript.md).
- **Agent / MCP integrations** — manage assets and subscriptions from AI tools.
  See [MCP](components/mcp.md).
- **Alternative payment rails** — accept HTTP / agent payments via the x402
  `ocr-permit-v1` scheme that still settles through `Asset.subscribe()`. See
  [x402 adapter](components/x402-adapter.md) and [Payment methods](../OCR_PAYMENT_METHODS.md).

---

## Live deployments

| Service | URL |
|---------|-----|
| Pet Shop demo (Base Sepolia) | https://frontendpet-shop-production.up.railway.app |
| Indexer GraphQL API + playground | https://indexer-api-production-c33d.up.railway.app/v2/graphql |

---

## Documentation map

### Protocol
- [Protocol Specification](../PROTOCOL.md) — the primitive, roles, on-chain components, payment flow
- [Glossary](../GLOSSARY.md) — canonical term definitions
- [Architecture](../ARCHITECTURE.md) — component map and data flows
- Protocol surface: [FROZEN](../protocol-surface/FROZEN.md) · [VERSIONED](../protocol-surface/VERSIONED.md) · [ADDITIVE](../protocol-surface/ADDITIVE.md)

### Components
- [Contracts](components/contracts.md) — `Asset`, `AssetRegistry`
- [Indexer](components/indexer.md) — Ponder v2 GraphQL API
- [TypeScript SDK](components/sdk-typescript.md)
- [Unity SDK](components/sdk-unity.md)
- [Demo (Pet Shop)](components/demo.md)
- [x402 adapter](components/x402-adapter.md)
- [MCP server](components/mcp.md)

### Guides
- [Getting started: TypeScript](guides/getting-started-typescript.md)
- [Getting started: Unity](guides/getting-started-unity.md)
- [Running the indexer locally](guides/running-the-indexer.md)

### Payment rails & extension
- [OCR payment methods](../OCR_PAYMENT_METHODS.md)
- [Extending with Stripe / fiat](../OCR_EXTENDING_STRIPE.md)
- [Extending with predicate unlock](../OCR_EXTENDING_PREDICATE_UNLOCK.md)

---

## The model in one diagram

```
Creator ──createAsset()──▶ AssetRegistry ──deploys──▶ Asset (per resource)
                                                        │
Subscriber ──permit + subscribe(count)──────────────────▶  payment held in Asset
                                                        │
              events ─────────────────────────────────▶ Indexer (Ponder, /v2/graphql)
                                                        │
Web / Unity / agent ──isSubscriptionActive(subscriber)──▶ access decision
```

Subscriptions are bought in whole-period `count`s; the charge is
`count * subscriptionPrice`. Fees are **not** split at subscribe time — they
accrue per elapsed period and are withdrawn later via `claimCreatorFee` /
`claimRegistryFee`.

---

## Repositories

| Repo | Role |
|------|------|
| [open-creator-rails](https://github.com/ChainSafe/open-creator-rails) | Contracts (`Asset`, `AssetRegistry`) |
| [open-creator-rails.indexer](https://github.com/ChainSafe/open-creator-rails.indexer) | Ponder indexer + GraphQL API |
| [open-creator-rails.sdk](https://github.com/ChainSafe/open-creator-rails.sdk) | TypeScript SDK |
| [open-creator-rails.unity](https://github.com/ChainSafe/open-creator-rails.unity) | Unity (C#) SDK |
| [open-creator-rails.demo](https://github.com/ChainSafe/open-creator-rails.demo) | Pet Shop reference app |
| [open-creator-rails.x402-adapter](https://github.com/ChainSafe/open-creator-rails.x402-adapter) | x402 payment rail |
| [open-creator-rails.mcp](https://github.com/ChainSafe/open-creator-rails.mcp) | MCP server |
