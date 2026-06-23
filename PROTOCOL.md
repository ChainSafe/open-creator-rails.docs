# Open Creator Rails — Protocol Specification

**Version:** 0.1.2  
**Last updated:** 2026-06-16

> **This is a descriptive document.** It reflects current implementation reality as understood at the time of each edit. Authoritative, machine-enforceable guarantees live in `/.invariants` (apex) and `{sub-repo}/.invariants` (scoped). This file is agent-editable — the conformance agent updates it when it detects drift between prose and code.

---

## 2. Core Primitive

Open Creator Rails defines one minimal, verifiable on-chain primitive:

```
(subscriber, asset) → isSubscriptionActive
```

Where:
- **subscriber** (`bytes32`): An arbitrary identity handle. The contracts impose no constraints on its derivation. Application-layer convention (required for cross-SDK interoperability): `keccak256(abi.encode(subscriberId, subscriberAddress))` where `subscriberId` is a human-readable string namespace (e.g. `"demo"`, `"ocr-permit-v1"`) and `subscriberAddress` is the wallet address embedded in that identity.
- **asset** (`address`): The deployed `Asset` contract address. Each Asset represents one subscribable resource.

The primitive answers **whether an entitlement is active on-chain**. What that entitlement unlocks in a product (video, game content, API access, etc.) is an **application-layer** mapping on top of `isSubscriptionActive`.

### 2.1 Access Check

A subject has access to a resource if and only if:

```solidity
Asset(asset).isSubscriptionActive(subscriber)
// implemented as:
//   getSubscriptionExpiration(subscriber) > block.timestamp
//   && !isSubscriberRevoked(subscriber)
```

This is the **only** on-chain access check. No roles, no token balances, no off-chain state. The on-chain state is the ground truth.

### 2.2 What "active subscription" means internally

Each `bytes32` subscriber can have multiple subscription records keyed by an incrementing **nonce**. The current record for fee-claim cursors uses `nonces[subscriber]`.

A record stores `startTime`, `endTime`, `subscriptionPrice` (rate at time of subscribe), `registryFeeShare` (% at time of subscribe), and `payer`.

Lifecycle on subscribe:
- **First subscription** for a subscriber → `SubscriptionAdded`
- **Extension** while still active with same payer, price, and fee share → `SubscriptionExtended` (same nonce, longer `endTime`)
- **Renewal** when terms differ or subscription lapsed → new nonce, `SubscriptionRenewed`

Termination:
- **Revoke** (asset owner) → subscriber marked revoked; cannot resubscribe until `unrevokeSubscription`
- **Cancel** (subscriber self-service) → `cancelSubscription(subscriberId, signature)`; subscriber hash is `keccak256(abi.encode(subscriberId, msg.sender))`

---

## 3. Protocol Roles

| Role | Description |
|------|-------------|
| **Registry Owner** | Deploys and governs the `AssetRegistry`. Controls the registry-level fee share. |
| **Creator** | Deploys `Asset` contracts via the `AssetRegistry`. Sets subscription price and duration. Receives creator fee share. |
| **Subscriber** | A `bytes32` subject identity. Holds a subscription (entitlement) on an Asset. |
| **Payer** | An `address` that funds a subscription. May differ from the subject (e.g., a sponsor, a game account, a facilitator). |
| **Facilitator** | (x402 context) A service that verifies an off-chain payment payload and broadcasts `Asset.subscribe()` on-chain (gas sponsor only; tokens still flow payer → Asset). |

---

## 4. On-Chain Components

### 4.1 AssetRegistry

The registry is the entry point for creators. It:

- Creates new `Asset` contracts (minimal proxy / clone pattern)
- Maintains a global registry fee share as an **integer percent in `[0, 100]`** (not basis points)
- Provides enumeration and lookup of all Assets

**MUST** expose (representative):

| Function | Description |
|----------|-------------|
| `createAsset(...)` | Deploys a new Asset clone, emits `AssetCreated` |
| `getAsset(assetId)` | Returns Asset metadata by ID |
| `getRegistryFeeShare()` | Registry share percent (0–100) |
| `updateRegistryFeeShare(percent)` | Registry owner updates global fee share |
| `cancelSubscription(assetAddress, subscriber)` | Registry-owner emergency cancel |

### 4.2 Asset

Each `Asset` is an independently addressable subscription contract. It:

- Stores the subscription price per **period** (token amount; must be a multiple of 100)
- Stores a fixed **subscription duration** in seconds (`SUBSCRIPTION_DURATION`); subscriptions are purchased in whole-period **counts**
- Stores the payment token address (ERC-20 with EIP-2612 `permit`)
- Maintains subscription records per `(subscriber, nonce)`
- Holds all payments until creator/registry **claim** fees later

**MUST** expose (representative):

| Function | Description |
|----------|-------------|
| `subscribe(subscriber, payer, spender, count, deadline, v, r, s)` | Atomic permit + payment + entitlement grant; returns new `endTime` |
| `getSubscriptionExpiration(subscriber)` | Returns expiry timestamp for current nonce |
| `isSubscriptionActive(subscriber)` | Not expired and not revoked |
| `isSubscriptionExpired(subscriber)` | `endTime <= block.timestamp` |
| `isSubscriberRevoked(subscriber)` | Owner revoked this subscriber |
| `getSubscriptionPrice(count)` | `count * subscriptionPrice` |
| `getSubscriptionDuration()` | Fixed period length in seconds |
| `revokeSubscription(subscriber)` | Creator emergency revoke |
| `unrevokeSubscription(subscriber)` | Creator lifts revocation |
| `cancelSubscription(subscriberId, signature)` | Subscriber self-cancel (string id + EIP-191 signature) |
| `setSubscriptionPrice(price)` | Creator updates price per period |
| `claimCreatorFee(subscriber)` | Creator claims accrued fees |
| `claimRegistryFee(subscriber)` | Registry claims accrued fees |

There is no `hasAccess()` or `getSubscription()` alias in the current interface — use `isSubscriptionActive` / `getSubscriptionExpiration`.

### 4.3 Payment Flow

Subscriptions are purchased in **`count` full periods**, not arbitrary minute/day inputs at the contract layer.

```
Payer wallet
  │
  ├─ signs EIP-2612 permit (token, spender=Asset, value=count*subscriptionPrice, deadline)
  │
  └─ calls Asset.subscribe(subscriber, payer, spender=Asset, count, deadline, v, r, s)
       │
       ├─ Asset validates: spender == address(this)
       ├─ Asset calls token.permit(...) then token.safeTransferFrom(payer, Asset, value)
       │   [ALL payment held in Asset — NOT distributed at subscribe time]
       ├─ duration = count * SUBSCRIPTION_DURATION
       └─ Asset writes or extends subscription record (see §2.2)
```

**Key properties:**
- Permit and payment transfer are atomic in one transaction
- Subscriber identity (`bytes32`) is decoupled from payer address
- Fees are pull-based: creator and registry claim via `claimCreatorFee` / `claimRegistryFee`
- Extension is in-place when still active with matching payer/price/fee share; otherwise a new nonce is allocated

**Payment rails (off-chain pattern):** Direct wallet subscribe and the x402 `ocr-permit-v1` adapter are two implemented rails. Both must satisfy the same on-chain requirements (permit + ERC-20 transfer + `subscribe()`). Alternate checkout UX (e.g. fiat on-ramp) is an adapter concern outside the frozen `subscribe()` ABI. See `OCR_PAYMENT_METHODS.md` for product-facing wording.

---

## 5. Off-Chain Components

### 5.1 Indexer

The indexer provides queryable, low-latency access to on-chain state. It is an acceleration layer — the on-chain state always overrides indexed state in case of conflict.

**Primary purpose:** Fast reads. Subscriptions and asset lists should be read from the indexer; on-chain verification remains available as fallback.

**Required entities (representative):**

| Entity | Primary Key | Description |
|--------|-------------|-------------|
| `RegistryEntity` | `{chainId}_{registryAddress}` | One record per registry deployment |
| `AssetEntity` | `{chainId}_{assetAddress}` | One record per deployed Asset |
| `Subscription` | `{assetEntityId}_{subscriber}_{nonce}` | One row per subscription nonce |
| `SubscriptionEvent` | event log ID | Immutable event log |

**Subscription active state — consumer pattern:**

For the latest nonce row, treat a subscription as effectively active when:

```
!isRevoked && endTime > now
```

`isRevoked` reflects owner `SubscriptionRevoked`. `endTime > now` reflects time-based expiry. Neither condition alone is sufficient.

When listing "current" access for a subscriber, consumers should consider the **latest nonce** for that `(asset, subscriber)` pair.

### 5.2 TypeScript SDK

Language-level abstraction over contracts + indexer for web/Node.js applications.

- Exposes contract operations (read + write) and indexer helpers
- Supports on-chain and indexer data sources with configurable fallback
- Derives subscriber identity via `subscriberHash(subscriberId, subscriberAddress)` = `keccak256(abi.encode(subscriberId, subscriberAddress))` (see `open-creator-rails.sdk/src/utils.ts`)

### 5.3 Unity SDK

Language-level abstraction for Unity/C# game clients.

- Exposes asset discovery, subscription check, and subscribe flow
- Must use the same `keccak256(abi.encode(subscriberId, subscriberAddress))` formula as the TypeScript SDK for interoperable identities
- Should use the indexer for reads; must fall back to RPC when indexer is unavailable

### 5.4 x402 Settlement Adapter

Bridges HTTP 402-style payment verification with OCR subscriptions using scheme **`ocr-permit-v1`**.

Current implementation (`open-creator-rails.x402-adapter`):
- Exposes `/verify`, `/settle`, `/supported`
- Uses **EIP-2612 permit** (not EIP-3009) — payer signs permit; facilitator broadcasts `Asset.subscribe()`
- After verification, calls `Asset.subscribe(subscriber, payer, assetAddress, count, deadline, v, r, s)`
- x402 subscriber namespace: `subscriberId = keccak256(abi.encode("ocr-permit-v1", payerAddress))` — distinct from other application ids such as `"demo"`

See `open-creator-rails.x402-adapter/docs/ocr-permit-v1.md`.

### 5.5 Creator Console (MCP)

A Model Context Protocol server that exposes OCR operations as AI-callable tools (create registry, create asset, set pricing, list assets, check subscription status).

### 5.6 Subject & Wallet Linkage SDK

Planned/auth-agnostic linkage of a `bytes32` subject to wallet addresses without revealing the link on-chain (ZK-based approach). Integration path: `data-stream-contracts`.

---

## 6. Cross-Cutting Requirements

### 6.1 Identity Convention

On-chain storage is always `bytes32 subscriber`. Applications choose a string **subscriber id namespace** and pair it with a wallet address:

```
subscriber = keccak256(abi.encode(subscriberId_string, subscriberAddress))
```

Examples in current deployments:
- Demo / direct wallet path: `subscriberId = "demo"`
- x402 gasless path: `subscriberId = "ocr-permit-v1"`

TypeScript (viem):

```typescript
import { encodeAbiParameters, keccak256 } from 'viem'

subscriber = keccak256(
  encodeAbiParameters(
    [{ type: 'string' }, { type: 'address' }],
    [subscriberId, subscriberAddress],
  ),
)
```

**Do not** use `keccak256(encodePacked([address]))` or address-only hashing — that is a different identity namespace and breaks cross-client visibility.

Self-cancel uses the same string id: `cancelSubscription(subscriberId, signature)` where `msg.sender` must be the address baked into the subscriber hash.

### 6.2 Entity ID Consistency

Indexer composite IDs:

```
RegistryEntity.id = "{chainId}_{registryAddress.toLowerCase()}"
AssetEntity.id    = "{chainId}_{assetAddress.toLowerCase()}"
Subscription.id     = "{assetEntityId}_{subscriber}_{nonce}"
```

SDKs and indexers must construct and parse IDs in these formats.

### 6.3 Time Semantics

- All timestamps are Unix seconds (`uint256`)
- Active means `endTime > block.timestamp` (strictly greater) and not revoked
- Extension while still active: `newEndTime = previousEndTime + count * SUBSCRIPTION_DURATION`
- New period after lapse: `startTime = block.timestamp`, `endTime = startTime + duration`

### 6.4 Fee Distribution

Fees are NOT distributed at subscribe time. Payment is held in the Asset contract and claimed later.

```
fee_for_period = elapsed_seconds * subscriptionPrice
registryShare  = fee_for_period * registryFeeShare / 100   // integer percent, NOT basis points
creatorShare   = fee_for_period - registryShare
```

`registryFeeShare` is stored per subscription record at subscribe time and is an integer in `[0, 100]`.

---

## 7. Event Semantics

Canonical Asset events (current contract source):

### Asset events

| Event | Fields |
|-------|--------|
| `SubscriptionAdded` | `subscriber`, `startTime`, `endTime`, `payer`, `subscriptionPrice`, `registryFeeShare` |
| `SubscriptionRenewed` | `subscriber`, `startTime`, `endTime`, `nonce`, `payer`, `subscriptionPrice`, `registryFeeShare` |
| `SubscriptionExtended` | `subscriber`, `endTime` |
| `SubscriptionRevoked` | `subscriber`, `nonce`, `endTime` |
| `SubscriptionCancelled` | `subscriber`, `nonce`, `endTime` |
| `SubscriptionRemoved` | `subscriber` |
| `CreatorFeeClaimed` | `subscriber`, `amount`, `claimedAtTimestamp`, `claimedAtNonce` |
| `SubscriptionPriceUpdated` | `newSubscriptionPrice` |

### AssetRegistry events

| Event | Fields |
|-------|--------|
| `AssetCreated` | `assetId`, `asset`, `subscriptionPrice`, `tokenAddress`, `owner` |
| `RegistryFeeShareUpdated` | `newRegistryFeeShare` |
| `RegistryFeeClaimed` | `subscriber`, `amount` |
| `RegistryFeeClaimedBatch` | `assetId`, `subscribers[]`, `totalAmount` |

> There is no `Subscribed` event. New subscriptions emit `SubscriptionAdded`; in-place extensions emit `SubscriptionExtended`; term changes emit `SubscriptionRenewed`. Indexers must handle all three.

---

## 8. Versioning

This protocol uses [Semantic Versioning](https://semver.org/):

- **MAJOR** bump: Breaking change to the core primitive or any FROZEN interface requiring coordinated migration
- **MINOR** bump: Additive change (new optional field, new endpoint, new tool)
- **PATCH** bump: Clarification, documentation fix, non-breaking implementation guidance

Current version: **0.1.2** (pre-release, contract-verified revision; doc sync 2026-06-16)

---

## 9. Open Questions (as of 2026-06-16)

| # | Question | Status |
|---|----------|--------|
| OQ-1 | x402 adapter payment shape (EIP-2612 permit relay vs EIP-3009) | **Resolved** — `ocr-permit-v1` uses EIP-2612 permit + `Asset.subscribe()` (`open-creator-rails.x402-adapter`) |
| OQ-2 | ZK wallet linkage branch access | Open |
| OQ-3 | Product-layer period abstraction (minutes/days UI) vs on-chain `count` | **Resolved** — SDK/product maps calendar time to period counts |
| OQ-4 | High-performance Verifier vs Ponder GraphQL | Open |
| OQ-5 | Cancel/refund when payer ≠ subscriber address in record | Open |
| OQ-6 | `createAsset` gated to registry owner only — open to any creator? | Open |
| OQ-7 | Cancellation couples string `subscriberId` + `msg.sender` into bytes32 | Open — application policy; document namespaces (`demo`, `ocr-permit-v1`, etc.) |
| OQ-8 | Predicate / zero-payment entitlement grant without ERC-20 transfer | Open — **not supported** by current `subscribe()` ABI; would require additive protocol surface |
