# Documentation Verification Matrix

> Internal audit trail. Every user-facing claim in `docs/` is traced here to a
> source file and line range that was read directly during authoring. The code
> is the source of truth; prose that contradicted the code was corrected, not
> copied. Line numbers reflect the `feat/invariants` branch state at the time
> of writing (2026-06-23).

Legend: **PASS** = doc matches code · **FIXED** = prior prose was wrong, corrected from code · **FLAG** = governance artifact (TPM-owned) contradicts code, cannot edit, escalated.

---

## Contracts — `open-creator-rails/src/`

| Claim in docs | Status | Source |
|---|---|---|
| `isSubscriptionActive(subscriber) = !expired && !revoked` | PASS | `Asset.sol:202-204` |
| Expired means `getSubscriptionExpiration(subscriber) <= block.timestamp` (endTime itself is expired) | PASS | `Asset.sol:186-188`; boundary test `test/Asset.t.sol:964-971` |
| Revoked tracked in `revokedSubscribers` set | PASS | `Asset.sol:194-196` |
| `subscribe(bytes32 subscriber, address payer, address spender, uint256 count, uint256 deadline, uint8 v, bytes32 r, bytes32 s) → uint256` | PASS | `Asset.sol:206-223`, `IAsset.sol:77-86` |
| `spender` MUST equal `address(this)` | PASS | `Asset.sol:309-311` |
| Permit then `safeTransferFrom`; amount = `count * subscriptionPrice` | PASS | `Asset.sol:220, 313-314` |
| `subscriptionPrice` must be non-zero multiple of 100 | PASS | `Asset.sol:119, 157` |
| Subscription purchased in whole-period `count`, not arbitrary duration | PASS | `Asset.sol:210, 226`, `IAsset.sol:71` |
| New subscriber → `SubscriptionAdded` | PASS | `Asset.sol:272` |
| Same nonce in-place extend (active, same payer/price/feeShare) → `SubscriptionExtended` | PASS | `Asset.sol:245-256` |
| Differing terms / lapsed → new nonce → `SubscriptionRenewed` | PASS | `Asset.sol:259-267` |
| `SubscriptionAdded(subscriber, startTime, endTime, payer, subscriptionPrice, registryFeeShare)` — 6 params, 3 indexed | PASS | `Asset.sol:70-77` |
| Registry fee share is integer percent `[0,100]`, not basis points | FIXED | `AssetRegistry.sol:42-48, 150-151, 158-164`; fee math `Asset.sol:373` (`/ 100`) |
| Creator share is the remainder `100 - registryFeeShare` (not a separately-set value) | FIXED | `AssetRegistry.sol:146-148` |
| Fee split: `registryFee = fee * registryFeeShare / 100`; creator gets `fee - registryFee` | PASS | `Asset.sol:372-379` |
| Payment held in Asset until pull-based claim | PASS | `Asset.sol:388-410` (creator), `459-482` (registry) |
| `revokeSubscription` / `unrevokeSubscription` owner-only | PASS | `Asset.sol:618-642` |
| Revoke refunds remaining time incl. dust to `payer` | PASS | `Asset.sol:578-596` |
| **Cancel is single-step** `cancelSubscription(string subscriberId, bytes signature)` | FIXED | `Asset.sol:644-666`, `IAsset.sol:129-132` |
| Cancel digest = `keccak256(abi.encodePacked(chainid, address(this), subscriber))` then EIP-191 | PASS | `Asset.sol:651-653, 678-681` |
| `createAsset(bytes32, uint256 price, uint256 duration, address token, address owner)` owner-only | PASS | `AssetRegistry.sol:53-70` |
| `AssetCreated(assetId, assetAddress, subscriptionPrice, subscriptionDuration, tokenAddress, owner)` | PASS | `AssetRegistry.sol:23-30` |

### Contract-layer FLAGs (TPM-owned `.invariants`, not agent-writable)

- `cancel_commitment_protocol` asserts a **two-step commit-reveal** flow
  (`commitCancellation` + `cancelSubscription(subscriberId, timestamp, signature)`).
  **The code has no `commitCancellation` and cancel is single-step**
  (`Asset.sol:644`, `IAsset.sol:132`; `rg commitCancellation` returns nothing).
  Docs describe the single-step reality. `.invariants` needs a TPM correction.
- `primitive_access_check_semantics` claim states active ⇔ `getSubscription > block.timestamp`
  and omits revocation. Code also requires `!isRevoked` (`Asset.sol:202-204`).
  Docs state the full rule.

---

## Subscriber identity derivation (cross-SDK)

Canonical form: `keccak256(abi.encode(subscriberId /*string*/, subscriberAddress /*address*/))`.

| Implementation | Status | Source |
|---|---|---|
| Contract cancel derivation `_hash(string, address)` | PASS | `Asset.sol:673-676` |
| IAsset NatSpec recommends canonical form | PASS | `IAsset.sol:40-41, 67-68` |
| TS SDK `subscriberHash(subscriberId, subscriberAddress)` | PASS | `open-creator-rails.sdk/src/utils.ts:8-18` |
| Unity `ToSubscriberIdHash(string[, EthereumAddress])` = `keccak256(abi.encode(string, address))` | PASS | `open-creator-rails.unity/io.chainsafe.open-creator-rails/Runtime/Utils/Extensions.cs:124-129` |
| MCP `deriveSubscriberId(subscriberId, address)` | PASS | `open-creator-rails.mcp/src/subscriber.ts:13-20` |
| x402 uses fixed namespace `keccak256(abi.encode("ocr-permit-v1", userAddress))` — distinct, intentional | PASS | `open-creator-rails.x402-adapter/src/subscriber.ts:1-15` |
| Old `encodePacked(address)` SDK formula no longer present | FIXED | `rg subscriberToId open-creator-rails.sdk/src` → none; only `subscriberHash` |

---

## Indexer — `open-creator-rails.indexer/`

| Claim | Status | Source |
|---|---|---|
| Recommended API is v2 GraphQL at `/v2/graphql` | PASS | `queries.md:1-3`, `src/api/v2.ts:18-39` |
| Entities: RegistryEntity, AssetEntity, Subscription, SubscriberClaimable | PASS | `ponder.schema.ts:9, 20, 45, 66+` |
| Registry ID `${chainId}_${registryAddress}` | PASS | `ponder.schema.ts:10` |
| Asset ID `${chainId}_${assetAddress}` | PASS | `ponder.schema.ts:21` |
| Subscription ID `${AssetEntity.id}_${subscriber}_${nonce}` | PASS | `ponder.schema.ts:46` |
| Computed `Subscription.isActive` = `!isRevoked && startTime <= now < endTime` | PASS | `src/api/subscription/resolvers.ts:26-29` |
| Query filter `activeSubscriptions` = `!isRevoked && startTime < now && endTime > now` | PASS | `src/api/helpers.ts:48-55` |
| Queries: registries, assets, subscriptions, activeSubscriptions, expiringSubscriptions | PASS | `src/api/subscription/typeDefs.ts:21-26` |
| Pagination: `limit` default 50, max 1000, offset-based | PASS | `src/api/helpers.ts:71-72, 87` |
| Chains: sepolia(11155111), baseSepolia(84532), local(31337), env-gated | PASS | `ponder.config.ts:22-41` |
| Indexer ABI has current single-step `cancelSubscription(string, bytes)` | PASS | `config/AssetABI.ts:33-50` |
| Indexer ABI `SubscriptionAdded` has all 6 params | PASS | `config/AssetABI.ts:505-543` |

---

## TypeScript SDK — `open-creator-rails.sdk/`

| Claim | Status | Source |
|---|---|---|
| `subscriberHash` = `keccak256(abi.encode(string, address))` | PASS | `src/utils.ts:8-18` |
| `cancelSubscriptionDigest(chainId, asset, subscriber)` = `keccak256(encodePacked(uint256, address, bytes32))` | PASS | `src/utils.ts:24-28` |
| `cancelSubscription({ subscriberId, signature })` single-step | PASS | `src/types/sdk.ts:56`, `src/client.ts:869-874` |
| SDK ABI single-step cancel | PASS | `src/config/AssetABI.ts:36-53` |
| Indexer client derives subscriber via `subscriberHash` | PASS | `src/indexer.ts:113, 234` |
| `indexerUrl` is caller-provided; requires a chain id | PASS | `src/client.ts:129-138` |

---

## Unity SDK — `open-creator-rails.unity/`

| Claim | Status | Source |
|---|---|---|
| `IsSubscriptionActive/GetSubscriptionExpiration/IsSubscriptionExpired/IsSubscriberRevoked` derive via `ToSubscriberIdHash()` | PASS | `Runtime/Asset.cs:153-178` |
| No `HasAccess` method (prior map note obsolete) | FIXED | `Runtime/Asset.cs` (no match) |
| Event DTOs subscribed incl. Added/Renewed/Extended/Cancelled/Revoked | PASS | `Runtime/Asset.cs:117-128` |

---

## x402 adapter — `open-creator-rails.x402-adapter/`

| Claim | Status | Source |
|---|---|---|
| Scheme settles by calling `Asset.subscribe()`; facilitator pays gas only, tokens flow payer→Asset | PASS | `docs/architecture.md` flow; `src/routes/settle.ts` |
| Subscriber namespace `"ocr-permit-v1"` distinct from standard ids | PASS | `src/subscriber.ts:1-15` |
| Idempotency store is in-memory `(payer, permitNonce)` — production swap intended | PASS | `src/idempotency.ts`; issue `x402-adapter#1` |

---

## Demo — `open-creator-rails.demo/`

| Claim | Status | Source |
|---|---|---|
| Frontend gates content on indexer `isActive` (same rule as `Subscription.isActive`) | PASS | `src/app/views/AssetPage.tsx:353-356`, `src/app/views/MySubscriptionsPage.tsx:37` |
| Live Pet Shop on Base Sepolia | PASS | `docs/OCR_PET_SHOP.md` |

---

## Live deployments (documented URLs)

| Service | URL | Source |
|---|---|---|
| Pet Shop demo | `https://frontendpet-shop-production.up.railway.app` | `open-creator-rails.demo/docs/OCR_PET_SHOP.md` |
| Indexer GraphQL API | `https://indexer-api-production-c33d.up.railway.app` | `open-creator-rails.demo/.env.sepolia.example`, `scripts/railway-setup.sh` |

> Note: the demo `.env.sepolia.example` points `VITE_INDEXER_URL` at `/graphql`; the
> indexer's recommended/playground endpoint is `/v2/graphql` (`queries.md:1-3`).
