# Open Creator Rails — Glossary

**Version:** 0.1.1
**Last updated:** 2026-06-23

> This glossary defines terms canonically. When a term appears in any spec, impl, or task document, it carries exactly this meaning. Ambiguous usage is a drift signal. Definitions are verified against the contracts in `open-creator-rails/src/` — see `docs/VERIFICATION.md`.

---

## Core Terms

**Asset**
A deployed `Asset` contract representing one subscribable resource (e.g., a game level, a creator feed, a data stream). The `Asset` address is the `resourceId` in the core primitive. One creator can deploy many assets.

**AssetRegistry**
The factory contract through which creators' assets are deployed. Holds the global registry fee share. There is one registry per deployment environment (local/testnet/mainnet). `createAsset` is restricted to the registry owner (`AssetRegistry.sol:53-70`).

**Subject**
The `bytes32` identity that holds a subscription. Canonical derivation (required for cross-SDK interoperability): `keccak256(abi.encode(subscriberId, subscriberAddress))`, where `subscriberId` is a human-readable string namespace (e.g. `"demo"`, `"ocr-permit-v1"`) and `subscriberAddress` is the wallet address. The contracts impose no derivation on the `bytes32` passed to read/subscribe paths, but `cancelSubscription` derives it internally from `(subscriberId, msg.sender)` (`Asset.sol:673-676`). Auth-agnostic: a subject can correspond to a wallet, a game account, or any identity linked to a derivable address.

**SubscriberId**
The human-readable string namespace component of the subject derivation (e.g. `"demo"`). Combined with a wallet address to produce the `bytes32` subject. Passed directly to `cancelSubscription(string subscriberId, bytes signature)`.

**Payer**
The `address` whose ERC-20 balance funds a subscription, and the beneficiary of any refund on cancel/revoke. May differ from the wallet whose address was used to derive the subject. A facilitator, sponsor, or game backend can be the payer.

**Subscriber**
In human contexts: the entity that receives access. In contract contexts: the `bytes32` subject passed to `subscribe()`. In SDK/UI contexts: derived from the connected wallet address plus a subscriberId string.

**Subscription**
A record stored inside an `Asset` keyed by `keccak256(abi.encode(subscriber, nonce))`, holding `startTime`, `endTime`, `subscriptionPrice`, `registryFeeShare`, and `payer` (`Asset.sol:46-52`). A subscription is **active** when it is not expired and the subscriber is not revoked: `!isSubscriptionExpired(subscriber) && !isSubscriberRevoked(subscriber)` (`Asset.sol:202-204`).

**ExpirationTime / endTime**
Unix timestamp (seconds, `uint256`) at/after which the subscription is expired. Expiry is `getSubscriptionExpiration(subscriber) <= block.timestamp` — the `endTime` instant itself counts as expired (`Asset.sol:186-188`). `0` means no subscription record.

**Count**
The number of whole subscription periods purchased in a `subscribe()` call. Total charge is `count * subscriptionPrice`; total added time is `count * SUBSCRIPTION_DURATION` (`Asset.sol:206-226`). Subscriptions are bought in whole-period counts, not arbitrary durations.

**SUBSCRIPTION_DURATION**
The fixed period length in seconds for an Asset, set at deployment and immutable. Returned by `getSubscriptionDuration()`.

**Nonce**
A per-subscriber counter that keys distinct subscription records. A new nonce (record) is created on renewal when terms differ (price, registry fee share, or payer changed) or the prior subscription had lapsed; otherwise an active subscription with identical terms is extended in place under the same nonce (`Asset.sol:236-275`).

**SubscriptionPrice**
Token amount charged per subscription period, stored per-Asset. Must be a non-zero multiple of 100 (`Asset.sol:119, 157`). Denominated in the asset's configured ERC-20 token (atomic units).

**RegistryFeeShare**
Integer **percent** in `[0, 100]` (not basis points) of subscription revenue that flows to the registry. Set at the registry level by the registry owner; applied globally (`AssetRegistry.sol:42-48, 150-164`). Fee math: `registryFee = fee * registryFeeShare / 100` (`Asset.sol:373`).

**CreatorFeeShare**
The creator's share is the remainder, `100 - registryFeeShare` (`AssetRegistry.sol:146-148`). It is not a separately configured value and is not in basis points.

**Permit**
An EIP-2612 off-chain signature authorizing a token transfer. Used in `subscribe()` to atomically `permit` + `transferFrom` in a single transaction without a prior `approve()` (`Asset.sol:300-318`). The Asset contract must be the `spender`.

**EIP-3009**
`transferWithAuthorization` — an alternative token-authorization standard. **Not** used by OCR contracts or by the x402 adapter; OCR settlement always ends in an EIP-2612 `permit` + `Asset.subscribe()`. Listed here only to disambiguate.

**EntityId**
The composite primary key used in the indexer. Format: `{chainId}_{contractAddress}` for `RegistryEntity` and `AssetEntity`; `{chainId}_{assetAddress}_{subscriber}_{nonce}` for `Subscription` (`open-creator-rails.indexer/ponder.schema.ts:10, 21, 46`). Addresses are lowercased.

---

## Infrastructure Terms

**Indexer**
The Ponder-based service (`open-creator-rails.indexer`) that ingests on-chain events from `AssetRegistry` and `Asset` and exposes them via a v2 GraphQL API at `/v2/graphql`. Acceleration layer for reads; on-chain state is always authoritative.

**Facilitator**
In x402 context: a service that verifies an off-chain payment payload and broadcasts `Asset.subscribe()` on-chain, paying gas only — tokens still flow payer → Asset. Implemented by the x402 adapter (`open-creator-rails.x402-adapter`).

**Creator Console / MCP**
An MCP (Model Context Protocol) server (`open-creator-rails.mcp`) exposing OCR operations as AI-callable tools.

**x402**
An open HTTP payment standard (x402.org) built on HTTP 402 "Payment Required". OCR integrates x402 as an optional payment rail via the `ocr-permit-v1` scheme (EIP-2612 permit), not EIP-3009.

**Payment Rail**
A mechanism through which a subscriber pays for a subscription. OCR natively supports EIP-2612 permit-based payment (direct wallet); x402 `ocr-permit-v1` is an additional rail implemented via the adapter pattern. Any rail must ultimately call `Asset.subscribe()`.

**Subject & Wallet Linkage**
A system by which a `bytes32` subject can be linked to one or more wallet addresses. Explored in `data-stream-contracts` (commit-reveal / signature verification; ZK link contracts on a branch). Not part of the core OCR access path.

---

## Repository Shortnames

| Shortname | Repository |
|-----------|------------|
| `contracts` | `open-creator-rails` |
| `indexer` | `open-creator-rails.indexer` |
| `sdk` | `open-creator-rails.sdk` |
| `demo` | `open-creator-rails.demo` |
| `unity` | `open-creator-rails.unity` |
| `x402-adapter` | `open-creator-rails.x402-adapter` |
| `mcp` | `open-creator-rails.mcp` |
| `linkage` | `data-stream-contracts` |

---

## Anti-Patterns (Things This Protocol Is NOT)

| What it's not | Why it matters |
|---------------|----------------|
| A role-based access control system | Access is time-based: not expired and not revoked. No roles, no permission lists. |
| An NFT ownership gate | Entitlement is in the subscription record, not in token holdings. |
| A backend-first system | On-chain state is the ground truth. Indexer and facilitator are acceleration layers. |
| A wallet-identity system | The `bytes32` subject is intentionally wallet-agnostic. Wallet linkage is a separate, optional layer. |
