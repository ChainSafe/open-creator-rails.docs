# Extending OCR with predicate-based unlock

**Companion to:** `OCR_PAYMENT_METHODS.md`, `PROTOCOL.md` v0.1.2 (OQ-8)  
**Status:** extension guide — predicates are not in the reference stack today

---

## The ask

> "Can access depend on a predicate — hold NFT X, guild membership, KYC passed, promo code — including cases where **no payment** happens, but we still want a proper unlock?"

Yes — but **three different shapes** exist. Two are **trivial OSS extensions** (no contract fork). One is a **small additive contract fork** if you need zero-payment entitlements **on-chain**.

This doc explains which path fits which product story, and why open source is the unlock: you choose the layer to extend without renegotiating a platform contract.

---

## Recall: what OCR standardizes today

```
(subscriber, asset) -> isSubscriptionActive   // on-chain, verifiable
```

Anything that must be checked by **web + Unity + third-party integrators** with one line of code should end up as `isSubscriptionActive` (or a future additive on-chain equivalent).

Pure off-chain predicates without ever writing chain state **work** for a single app, but they are **not** the OCR primitive — other clients cannot see them.

---

## Three extension paths

| Path | Payment on-chain? | Contract changes? | Interoperable? | Effort |
|------|-------------------|-------------------|----------------|--------|
| **A. Predicate gate → then `subscribe()`** | Yes (sponsor or user pays) | None | Full | Low — adapter + app |
| **B. Predicate unlock off-chain only** | N/A | None | App-only | Low — app/API |
| **C. Predicate / grant without payment on-chain** | No | Additive fork | Full if deployed | Medium — fork `Asset` |

---

## Path A — Predicate gate, then normal subscribe (trivial, recommended)

**Story:** "Only users who pass predicate P may purchase (or receive a sponsored) subscription."

```
                    +------------------+
                    | Predicate service |  (your rules: NFT, allowlist, etc.)
                    +--------+---------+
                             | pass
                             v
                    +------------------+
                    | Payment rail      |  direct / x402 / stripe-v1
                    +--------+---------+
                             v
                    +------------------+
                    | Asset.subscribe   |
                    +------------------+
                             v
                    isSubscriptionActive -> app unlocks content
```

### How it works

1. User connects wallet.
2. Your **`predicate-adapter`** (or middleware in the demo API) evaluates rules:
   - `balanceOf(NFT) > 0`
   - `merkleProof` in allowlist
   - signed attestation from your backend
3. If **fail** → return 403, no subscribe button.
4. If **pass** → expose subscribe (user pays) **or** sponsor treasury calls `subscribe()` (free to user, still on-chain payment from sponsor).

### Why this is trivial in OSS

- **Zero** changes to `Asset.sol`.
- Reuse SDK `subscriberHash`, indexer, Unity bridge unchanged.
- Predicate logic lives entirely in **your** service (TypeScript, Rust, whatever).
- Reference: `open-creator-rails.demo` mock-api pattern (`/api/gated-urls`) already gates content off subscription status — swap in a predicate check before showing `SubscribeToAssetButton`.

```typescript
// illustrative — lives in your adapter, not in OCR core
async function canSubscribe(user: Address, asset: Address): Promise<boolean> {
  if (!(await holdsGuildNft(user))) return false
  if (!(await passesKyc(user))) return false
  return true
}
```

**Unlock semantics:** still `isSubscriptionActive`. Predicate is **eligibility**, not entitlement. Clean separation.

---

## Path B — Predicate unlock without OCR on-chain (trivial, app-local)

**Story:** "We only need our web app to hide/show content; we do not need Unity or external verifiers."

1. Predicate service returns `{ allowed: true }`.
2. Your API serves gated content. **No `subscribe()` call.**

### Trade-offs

| Pros | Cons |
|------|------|
| Fastest to ship | Not verifiable on-chain |
| No gas, no token | Unity / other clients need duplicate trust |
| Any rule shape | Not OCR-interoperable |

Use when the product is a **closed silo**. Do not call this "OCR subscription" in docs — call it "app access control."

OSS still helps: you can open-source the predicate service, but it is outside the `(subscriber, asset)` primitive.

---

## Path C — Zero-payment entitlement on-chain (additive fork, still OSS-trivial)

**Story:** "Predicate passed → grant subscription **on-chain** with **no ERC-20 transfer**, and every client must see it via `isSubscriptionActive`."

Today's frozen `subscribe()` **always** pulls tokens. Path C requires an **additive** contract function, for example:

```solidity
// illustrative — NOT in reference contracts today
function grantSubscription(
  bytes32 subscriber,
  uint256 count,
  bytes calldata predicateProof
) external onlyRole(PREDICATE_GRANTER) returns (uint256 endTime);
```

or asset-owner-only:

```solidity
function grantSubscription(bytes32 subscriber, uint256 count) external onlyOwner;
```

### Why this is still "trivial" with OSS

You are not waiting for a platform vendor:

1. **Fork** `open-creator-rails` (MIT/Apache — check license in repo).
2. Add `grantSubscription` on `Asset` (ADDITIVE surface — new function, old `subscribe()` untouched).
3. Deploy new Asset clones from your registry (or upgrade pattern if you add one).
4. Indexer: add handler for `SubscriptionAdded` events emitted by grant path (same event shape if you reuse `_subscribe` internals without payment).
5. SDK: one new method `asset.grantSubscription(...)`.
6. **Predicate adapter** verifies proof off-chain, calls `grant` via relayer key.

Consumers that only call `isSubscriptionActive` **keep working** without knowing whether payment or grant created the record.

Tracked in `PROTOCOL.md` as **OQ-8**.

### Predicate proof examples

| Predicate | On-chain verification | Off-chain grant (simpler) |
|-----------|----------------------|---------------------------|
| NFT holder | ERC-721 `ownerOf` in contract | Adapter checks NFT, owner calls grant |
| Merkle allowlist | Merkle proof in `grantSubscription` | Adapter checks proof, relayer grants |
| ZK attestation | Verifier contract | Adapter verifies ZK, relayer grants |

Off-chain grant + on-chain `grantSubscription` is the usual first step: predicate complexity stays in OSS adapter code, chain only records entitlement.

---

## Combining predicates with unlock UI

Regardless of path, **unlock** in the product is still:

```typescript
const onChain = await sdk.Asset.isSubscriptionActive({ subscriberId, user })
const eligible = await predicateService.check(user, asset) // Path A/C only

// Path A: eligible required to subscribe; access = onChain
// Path C: grant sets onChain when eligible
// Path B: access = eligible only (no onChain)

if (onChain) unlockContent()
```

Pet shop analogy: Unity spawns pets when `active: true` in `ocr:subscriptions`. Predicate logic stays in the **web layer** that builds that message — Unity unchanged.

---

## Why OSS is the key unlock here

Closed platforms force you to choose:

- their payment rails only, or
- their access model only, or
- wait for their predicate beta.

OCR OSS stack separates layers:

```
+-------------------------------------------------------------+
|  Your product: predicates, Stripe, promos, sponsor logic     |  <- fork freely
+-------------------------------------------------------------+
|  Adapters: x402, stripe-v1, predicate-grant-relayer        |  <- small services
+-------------------------------------------------------------+
|  OCR core: subscribe (frozen), isSubscriptionActive         |  <- stable primitive
+-------------------------------------------------------------+
|  SDK + indexer + Unity bridge                               |  <- reuse
+-------------------------------------------------------------+
```

**Path A** is days of work on a forked adapter.  
**Path C** is a focused contract PR on a forked `open-creator-rails`, then the same indexer/SDK patterns.

Neither requires permission. Both stay auditable. Both keep the cross-client access check one line.

---

## What to tell requesters

### If they want predicate + payment

> "Use a predicate adapter in front of the existing subscribe flow. No protocol change. We gate who may subscribe; OCR still records entitlement on-chain the same way."

### If they want predicate + no payment + cross-client unlock

> "Fork the OSS Asset contract with an additive `grantSubscription`, deploy your predicate relayer, reuse the indexer and SDK. The reference repo does not ship this yet, but the stack is designed for exactly that kind of extension."

### If they want predicate only in one web app

> "Skip on-chain entirely for v1, or use Path A with a sponsored treasury subscribe after the predicate passes."

---

## Related

- `OCR_PAYMENT_METHODS.md` — current rails and limits
- `OCR_EXTENDING_STRIPE.md` — fiat adapter pattern
- `PROTOCOL.md` OQ-8 — zero-payment on-chain grant
- `open-creator-rails.demo/mock-api/` — gated content pattern
