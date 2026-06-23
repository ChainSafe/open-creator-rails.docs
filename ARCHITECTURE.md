# Open Creator Rails — System Architecture

**Version:** 0.2.0
**Last updated:** 2026-06-23

> Verified against the implementation in `open-creator-rails/src/`,
> `open-creator-rails.indexer/`, `open-creator-rails.sdk/`,
> `open-creator-rails.x402-adapter/`, and `open-creator-rails.mcp/`.
> See `docs/VERIFICATION.md` for per-claim source citations.

---

## 1. Component Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EVM Chain (Base Sepolia / Sepolia)                │
│                                                                       │
│   ┌──────────────────┐        ┌────────────────────────────────────┐ │
│   │  AssetRegistry   │──────▶ │  Asset (clone, per resource)       │ │
│   │  createAsset()   │        │  subscribe(subscriber, payer,       │ │
│   │  getAsset()      │        │            spender, count, ...)     │ │
│   │  feeShare 0..100 │        │  isSubscriptionActive(subscriber)   │ │
│   └──────────────────┘        │  getSubscriptionExpiration(...)     │ │
│                               └────────────────────────────────────┘ │
│            ▲                              ▲                           │
│   ┌────────┴──────────────────────────────┴────────────────────────┐ │
│   │            ERC-20 with EIP-2612 permit (e.g. USDC)              │ │
│   └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
         │ events                    │ events
         ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Indexer — open-creator-rails.indexer (Ponder)      │
│   └─ GraphQL  /v2/graphql   (GraphiQL playground at same path)        │
│   Entities: RegistryEntity · AssetEntity · Subscription ·             │
│             SubscriberClaimable                                       │
└─────────────────────────────────────────────────────────────────────┘
         │ GraphQL                   │ JSON-RPC (on-chain reads)
         ▼                           ▼
┌───────────────────────┐   ┌────────────────────────────────────────┐
│  TypeScript SDK        │   │  Unity SDK (C#)                        │
│  open-creator-rails.sdk│   │  open-creator-rails.unity              │
│  OcrSdk                │   │  OpenCreatorRailsService               │
│  subscriberHash()      │   │  PonderIndexerProvider                 │
│  createSdkIndexer()    │   │  ToSubscriberIdHash()                  │
└───────┬───────────────┘   └────────────────────────────────────────┘
        │                                │
        ▼                                ▼
┌──────────────────┐     ┌───────────────────────────────────────────┐
│  Demo Web App     │     │  Game Client (Unity)                      │
│  open-creator-    │     │  - Asset discovery                        │
│  rails.demo       │     │  - Subscription gate (isActive)           │
│  React + Wagmi    │     │  - Subscribe flow (permit + tx)           │
└──────────────────┘     └───────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│            x402 Settlement Adapter — open-creator-rails.x402-adapter  │
│  Scheme: ocr-permit-v1 (EIP-2612 permit, NOT EIP-3009)                │
│  ├─ GET  /supported — advertise scheme/network                        │
│  ├─ POST /verify    — validate EIP-2612 permit signature off-chain    │
│  └─ POST /settle    — broadcast Asset.subscribe() (gas sponsor only)  │
│  Subject namespace: keccak256(abi.encode("ocr-permit-v1", payer))     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│            Creator Console MCP — open-creator-rails.mcp               │
│  MCP server exposing OCR operations as AI-callable tools              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│            Subject & Wallet Linkage — data-stream-contracts           │
│  Signature-verification / commit-reveal; ZK link contracts on branch  │
│  (exploratory; not on the core OCR access path)                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Repository Map

| Repository | Language | Role | Status |
|------------|----------|------|--------|
| `open-creator-rails` | Solidity | Contracts (`Asset`, `AssetRegistry`) | Active |
| `open-creator-rails.indexer` | TypeScript (Ponder) | Standalone production indexer | Active |
| `open-creator-rails.sdk` | TypeScript | Web/Node.js SDK | Active |
| `open-creator-rails.demo` | TypeScript (React) | Reference demo (Pet Shop) | Active |
| `open-creator-rails.unity` | C# (Unity) | Game client SDK | Active |
| `open-creator-rails.x402-adapter` | TypeScript | x402 facilitator / OCR bridge | Active |
| `open-creator-rails.mcp` | TypeScript | MCP server for creators | Active |
| `data-stream-contracts` | Solidity + TS | Wallet linkage / signature verification | Exploratory |

---

## 3. Data Flow: Subscribe (Happy Path)

```
User Wallet
    │  1. UI builds a subscriberId string + derives subject =
    │     keccak256(abi.encode(subscriberId, walletAddress))
    ▼
TypeScript SDK / Unity SDK
    │  2. User signs an EIP-2612 permit for count * subscriptionPrice
    │  3. SDK calls Asset.subscribe(subscriber, payer, spender=asset,
    │     count, deadline, v, r, s)
    ▼
Asset Contract (EVM)
    │  4. _validatePermit: spender must == address(this); permit() then
    │     safeTransferFrom(payer → Asset)  — full payment held in Asset
    │  5. Record written/extended under keccak256(abi.encode(subscriber, nonce))
    │  6. emit SubscriptionAdded | SubscriptionExtended | SubscriptionRenewed
    ▼
Indexer (Ponder)
    │  7. Ingests the event; upserts Subscription
    │     (id = {chainId}_{assetAddress}_{subscriber}_{nonce})
    ▼
SDK / UI
    │  8. Reads isSubscriptionActive(subscriber) on-chain, or the indexer's
    │     computed Subscription.isActive (!isRevoked && startTime <= now < endTime)
```

Fees are **not** distributed at subscribe time. They accrue over elapsed periods
and are withdrawn later via pull-based `claimCreatorFee` / `claimRegistryFee`
(`Asset.sol:388-529`).

---

## 4. Data Flow: Subscribe via x402 (`ocr-permit-v1`)

```
HTTP Client (browser, AI agent, game)
    │  1. GET /resource  (no payment)
    ▼
x402-enabled Resource Server
    │  2. 402 + PaymentRequired{scheme: ocr-permit-v1, network: eip155:...,
    │     asset: <Asset>, payTo: <Asset>, amount: price}
    ▼
HTTP Client
    │  3. Signs an EIP-2612 permit (payer = self, spender = Asset)
    │  4. POST /verify { permit, subscriberId, count }
    ▼
x402 Facilitator (OCR adapter)
    │  5. Verifies permit signature, nonce, deadline, idempotency
    │  6. POST /settle → Asset.subscribe(...)  (facilitator pays gas only;
    │     tokens flow payer → Asset; subject = keccak256(abi.encode(
    │     "ocr-permit-v1", payer)))
    ▼
Resource Server
    │  7. Retry GET /resource → verifies isSubscriptionActive(subject) → content
```

The facilitator is never the `payer` and cannot redirect tokens — `spender` is
enforced on-chain to equal the Asset (`Asset.sol:309-311`).

---

## 5. Dependency Graph

```
open-creator-rails (contracts; forge build emits canonical ABIs to out/)
    ◀── open-creator-rails.indexer  (submodule for ABIs + codegen; config/AssetABI.ts)
    ◀── open-creator-rails.sdk      (submodule for ABIs; src/config/AssetABI.ts)
        ◀── open-creator-rails.demo (depends on SDK)
        ◀── open-creator-rails.x402-adapter (depends on SDK + x402 spec)
        ◀── open-creator-rails.mcp  (depends on SDK)
    ◀── open-creator-rails.unity    (submodule for ABIs + codegen)

data-stream-contracts               (standalone, exploratory)
```

ABI sync invariant: each consumer's checked-in ABI must match the canonical
`forge build` artifacts in `open-creator-rails/out/`.

---

## 6. Network Targets

| Network | Chain ID | CAIP-2 | Purpose |
|---------|----------|--------|---------|
| Anvil (local) | 31337 | `eip155:31337` | Local development |
| Sepolia | 11155111 | `eip155:11155111` | Testnet |
| Base Sepolia | 84532 | `eip155:84532` | Testnet (Pet Shop demo) |
| Base | 8453 | `eip155:8453` | Production (target) |

Indexer chains are env-gated by `PONDER_RPC_URL_<chainId>` (`ponder.config.ts:22-41`).

---

## 7. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `bytes32` subscriber identity (not `address`) | Auth-agnostic: a subject can map to wallets, game accounts, or future linkage proofs |
| EIP-2612 permit for payment | Single transaction for approve + subscribe; spender pinned to the Asset |
| Whole-period `count` (not arbitrary duration) | Deterministic fee accounting and period-aligned refunds |
| Payment held in Asset, pull-based claims | Trustless: split enforced by contract math at claim time, not by a backend |
| Ponder for indexing | Self-hostable, Railway-deployable, simple v2 GraphQL surface |
| Asset = minimal proxy clone | Gas-efficient deployment of many assets |
| x402 `ocr-permit-v1` rail | Standard HTTP payment; lets agents pay autonomously while still settling through `Asset.subscribe()` |
| MCP for Creator Console | AI-native tooling for creators |
