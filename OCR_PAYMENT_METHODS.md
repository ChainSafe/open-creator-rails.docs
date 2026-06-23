# OCR payment methods and "unlock" semantics

**Status:** reflects `PROTOCOL.md` v0.1.2 and the codebase as of 2026-06-16.

This doc answers product questions that often come up as feature requests:

1. Who decides what gets "unlocked"?
2. Can OCR support different payment methods (Stripe, sponsors, predicates)?
3. Can we grant entitlements with **no on-chain payment** but still call `Asset.subscribe()`?

---

## 1. What OCR actually guarantees

OCR's on-chain primitive is one check:

```
(subscriber, asset) -> isSubscriptionActive
```

Implemented on `Asset` as:

```solidity
isSubscriptionActive(subscriber)
// = getSubscriptionExpiration(subscriber) > block.timestamp
//   && !isSubscriberRevoked(subscriber)
```

### What the asset decides vs what the app decides

| Layer | Decides |
|-------|---------|
| **On-chain (`Asset`)** | Whether a `bytes32` subscriber has an active entitlement right now (not expired, not revoked). Economics: price per period, period length, payment token. |
| **Application** | What that entitlement *means* in the product: video, API tier, Unity spawn, gated file, etc. |

Safe wording:

> "The asset is the source of truth for whether access is active."

Overpromising:

> "The asset decides what content is unlocked."

The pet shop demo is a concrete example: the web app checks `isSubscriptionActive`, then tells Unity which pets to spawn. Unity does not define access; it consumes entitlement state.

---

## 2. Subscriber identity (you need this for payment rails)

On-chain storage is always `bytes32 subscriber`. Applications derive it from a **string namespace** plus a wallet address:

```
subscriber = keccak256(abi.encode(subscriberId_string, subscriberAddress))
```

Current namespaces in the demo stack:

| Rail | `subscriberId` string | Used by |
|------|----------------------|---------|
| Direct wallet subscribe | `"demo"` | `open-creator-rails.demo` wallet path |
| x402 gasless | `"ocr-permit-v1"` | `open-creator-rails.x402-adapter` |

These are **different subscriber hashes** for the same wallet. A subscription under `"demo"` is not visible when checking `"ocr-permit-v1"`, and vice versa. Product UIs that support both rails typically OR the two checks (as the pet shop does).

SDK helper: `subscriberHash(subscriberId, subscriberAddress)` in `open-creator-rails.sdk/src/utils.ts`.

**Do not** mix in address-only hashing (`encodePacked(address)`). That is a separate, incompatible namespace.

---

## 3. How subscriptions are granted on-chain (frozen surface)

The only entitlement-grant path today is `Asset.subscribe()`:

```solidity
subscribe(
  bytes32 subscriber,
  address payer,
  address spender,   // must be address(this)
  uint256 count,     // whole periods, must be >= 1
  uint256 deadline,
  uint8 v, bytes32 r, bytes32 s
) returns (uint256 endTime)
```

Flow inside one transaction:

1. Payer signs **EIP-2612 permit** on the payment token (`spender = Asset`, `value = count * subscriptionPrice`).
2. Contract calls `permit` then `safeTransferFrom(payer, Asset, value)`.
3. Contract writes subscription time: `duration = count * SUBSCRIPTION_DURATION`.
4. Payment stays in the Asset until creator/registry **claim** fees later.

Implications for product:

- Billing is in **whole periods** (e.g. 5 min, 10 min), not arbitrary fractional minutes at the contract layer.
- `count = 0` is rejected.
- Token must support EIP-2612 `permit` (plain ERC-20 without permit cannot use this path).

The `subscribe()` ABI is **FROZEN** (see `/.invariants`). Payment adapters must converge on this call shape.

---

## 4. Payment rails implemented today

"Payment method" in OCR means: **how you satisfy permit + transfer + subscribe**, not a separate on-chain entitlement mechanism.

```
                    +------------------+
                    |  Asset.subscribe |
                    |  (permit + xfer) |
                    +--------+---------+
                             ^
              +--------------+---------------+
              |                              |
    +---------+---------+          +---------+---------+
    | Direct rail       |          | x402 ocr-permit-v1 |
    | Wallet signs      |          | Wallet signs       |
    | permit + pays gas |          | permit only        |
    | subscriberId demo |          | facilitator txs    |
    +-------------------+          | subscriberId       |
                                   | ocr-permit-v1      |
                                   +--------------------+
```

### 4.1 Direct (wallet pays gas)

- User wallet signs ERC-2612 permit.
- User wallet submits `Asset.subscribe()` (or registry wrapper that calls it).
- Typical `subscriberId`: `"demo"`.
- Implemented in `open-creator-rails.demo` (`SubscribeToAssetButton`, SDK `AssetRegistry.subscribe`).

### 4.2 Gasless (x402 facilitator pays gas only)

- User wallet signs ERC-2612 permit (same token economics).
- `open-creator-rails.x402-adapter` verifies permit off-chain (`POST /verify`), then broadcasts `Asset.subscribe()` (`POST /settle`).
- **Tokens still move payer -> Asset.** The facilitator does not substitute for payment; it pays transaction gas.
- Typical `subscriberId`: `"ocr-permit-v1"`.
- Scheme docs: `open-creator-rails.x402-adapter/docs/ocr-permit-v1.md`.

### 4.3 Payer vs subscriber

`payer` (who funds) and `subscriber` (bytes32 identity) are separate fields. A sponsor, treasury, or facilitator wallet can pay while entitlement is attributed to a derived subscriber hash. This is supported today without protocol changes.

### 4.4 Reading access after subscribe

- **Authoritative:** `Asset.isSubscriptionActive(subscriber)` on RPC.
- **Fast path:** indexer / SDK with rule `!isRevoked && endTime > now` on the latest nonce row.
- On-chain always wins if indexer and chain disagree.

---

## 5. What is NOT supported today

### Stripe / fiat checkout as a native OCR primitive

Stripe is not a built-in payment rail. A Stripe checkout can still *feed* OCR if the adapter chain ends with:

1. User (or sponsor) holds the Asset's payment token (e.g. USDC).
2. Valid EIP-2612 permit for `count * subscriptionPrice`.
3. Successful `Asset.subscribe()`.

That makes Stripe (or any fiat PSP) an **off-ramp/on-ramp + adapter** problem, not something the frozen `subscribe()` ABI encodes.

### Predicate-based entitlements with zero token payment

**Not supported.** Every `subscribe()` call:

- requires a permit for `count * subscriptionPrice`, and
- pulls that ERC-20 value into the Asset.

There is no "free subscribe" or "predicate satisfied -> grant without transfer" in the current contracts. You cannot honestly promise:

> "Run a predicate, pay nothing, still call `subscribe()` and get entitlement."

That would need an **additive** protocol surface (new function or new mode), tracked as open question OQ-8 in `PROTOCOL.md`. Examples of what that might look like (not implemented):

- `grantSubscription(subscriber, duration, authorizationProof)` with no ERC-20 pull, or
- owner/registry-only grant paths with explicit audit rules.

Until then, predicate logic can only live **off-chain** as a gate *before* something else pays and calls `subscribe()`, or as a separate non-OCR access system (not interoperable with `isSubscriptionActive`).

### Arbitrary subscription duration at the contract layer

Contracts accept **`count` of fixed periods**, not free-text "1 minute" or "6 minutes". UIs should offer multiples of `SUBSCRIPTION_DURATION` (pet shop uses a dropdown: 5 min, 10 min, ...).

---

## 6. Safe answers for stakeholders

### You can say

- OCR's access signal is `isSubscriptionActive` on a specific `(subscriber bytes32, asset address)` pair.
- Apps choose what that signal unlocks in the UI or game.
- Multiple payment **rails** can exist as adapters, as long as they complete permit + ERC-20 transfer + `subscribe()`.
- Gasless (x402) saves gas; it does **not** remove token payment.
- Different rails can use different `subscriberId` strings; check the namespaces your product actually uses.

### Do not say

- "OCR supports Stripe natively."
- "OCR can subscribe without paying tokens."
- "Any payment provider can skip the permit/transfer semantics."
- "One subscriber id covers all payment methods automatically."

### One-paragraph reply (copy/paste)

> OCR's on-chain entitlement is `Asset.isSubscriptionActive(subscriber)` — that's the access signal. The application maps that to whatever "unlock" means (content, game objects, API, etc.). Subscriptions are granted only through the frozen `Asset.subscribe()` path: EIP-2612 permit plus ERC-20 transfer for `count` whole billing periods. We ship two rails today — direct wallet and x402 `ocr-permit-v1` (gasless tx, not gasless tokens). Stripe or fiat would be an adapter that still ends in token + permit + `subscribe()`. Predicate-only or zero-payment entitlements are not supported on-chain today; that would require a new protocol surface.

---

## 7. Extension guides (OSS — ship without waiting on a vendor)

These are **not** in the reference deployment yet. They show how small adapter/fork work extends the stack while the frozen core stays stable.

| Doc | Purpose |
|-----|---------|
| `OCR_EXTENDING_STRIPE.md` | Stripe / fiat checkout as an adapter (clone x402 pattern) |
| `OCR_EXTENDING_PREDICATE_UNLOCK.md` | Predicate gates, sponsored subscribe, and optional on-chain grant fork |

## 8. Related docs

| Doc | Purpose |
|-----|---------|
| `PROTOCOL.md` | Full protocol spec (v0.1.2) |
| `/.invariants` | FROZEN guarantees (`subscribe` ABI, access semantics) |
| `open-creator-rails.x402-adapter/docs/ocr-permit-v1.md` | x402 scheme details |
| `open-creator-rails.demo/docs/OCR_PET_SHOP.md` | Pet shop demo narrative |
