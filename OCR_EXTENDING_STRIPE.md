# Extending OCR with Stripe (and other fiat PSPs)

**Companion to:** `OCR_PAYMENT_METHODS.md`, `PROTOCOL.md` v0.1.2  
**Status:** extension guide — not shipped in the reference stack today

---

## The ask

> "Can users pay with Stripe instead of connecting a wallet and signing permits?"

Yes — **without changing the frozen on-chain protocol.** Stripe is an **adapter problem**, not a contract problem.

That distinction is why OCR being **open source** matters: you do not wait for a vendor roadmap. You add a small service next to the stack you already run, the same way `open-creator-rails.x402-adapter` sits beside the demo today.

---

## What stays frozen (you do not touch this)

| Piece | Why leave it alone |
|-------|-------------------|
| `Asset.subscribe(...)` ABI | FROZEN — all rails must converge here |
| `isSubscriptionActive(subscriber)` | FROZEN — universal access check |
| Indexer + SDK read paths | Reuse as-is |

Stripe does not replace `subscribe()`. It replaces **how the user pays before `subscribe()` runs**.

---

## The pattern (same as x402, different checkout UX)

```
 User                Stripe              Your adapter              Chain
  |                    |                      |                      |
  |-- Checkout ------->|                      |                      |
  |                    |-- webhook paid ----->|                      |
  |                    |                      |-- permit + subscribe -> Asset
  |                    |                      |                      |
  |<-------- app polls isSubscriptionActive(subscriber) -----------|
```

After the adapter succeeds, every client (web, Unity, API) uses the **same** entitlement check as today. No fork of the game bridge, indexer schema, or SDK read APIs.

---

## Why this is trivial in an OSS stack

You already have a working template: **`open-creator-rails.x402-adapter`**.

| x402 adapter today | Stripe adapter tomorrow |
|--------------------|-------------------------|
| `POST /verify` — validate permit | `POST /stripe/webhook` — validate Checkout session |
| `POST /settle` — broadcast `subscribe()` | `POST /stripe/fulfill` — broadcast `subscribe()` |
| Facilitator wallet pays gas | Treasury or facilitator pays gas |
| User signs EIP-2612 permit | User signs permit **or** treasury pays from float |
| `subscriberId = "ocr-permit-v1"` | `subscriberId = "stripe-v1"` (your namespace) |

Rough size: **one small Node service** (Hono/Express), one env file, one webhook secret. Clone the x402 repo layout, swap verify/settle for Stripe handlers. The pet shop demo already shows how the frontend points at an external facilitator URL.

**OSS unlock:** no API keys to ChainSafe, no "enterprise tier" for payment plugins. Fork, deploy on Railway next to `frontend_pet-shop`, point the demo at it.

---

## Two implementation options (pick one)

### Option A — User still holds USDC (Stripe as on-ramp only)

1. Stripe Checkout charges fiat.
2. On success, user receives USDC (CEX, on-ramp partner, or your treasury sends to their wallet).
3. Existing **direct** or **x402** rail runs unchanged: user signs permit, `subscribe()` executes.

**Effort:** mostly Stripe + on-ramp integration. **Zero** new OCR code if the user ends up with tokens in wallet.

### Option B — Treasury subscribes on behalf of user (fully fiat UX)

1. Stripe Checkout charges fiat.
2. Webhook hits your **`stripe-ocr-adapter`**.
3. Adapter maps `stripeCustomerId` / email → wallet address (user links wallet once, or you create a custodial mapping).
4. Adapter uses a **treasury hot wallet** that holds USDC:
   - signs permit (treasury as `payer`), or
   - pre-approves Asset and calls `subscribe(subscriber, payer=treasury, ...)`.
5. `subscriber = keccak256(abi.encode("stripe-v1", userWallet))`.

**Effort:** one adapter service + treasury ops. **No contract changes.**

Option B is what most "pay with card" products want. It is structurally identical to x402 settle, except verification is a Stripe signature instead of an EIP-712 permit.

---

## Sketch: minimal adapter surface

```typescript
// stripe-ocr-adapter (new repo or folder — copy x402-adapter)

POST /checkout/create
  body: { assetAddress, count, userWallet }
  -> Stripe Checkout Session URL

POST /stripe/webhook
  -> verify Stripe signature
  -> on checkout.session.completed:
       subscriber = subscriberHash("stripe-v1", userWallet)
       price = await asset.getSubscriptionPrice(count)
       // treasury signs permit + subscribe, or relayer pattern
       tx = await asset.subscribe(subscriber, treasury, asset, count, ...)
  -> return 200

GET /health
```

Frontend change in `open-creator-rails.demo`:

- Add `"stripe"` to payment mode picker (alongside wallet / gasless).
- On success, invalidate the same React Query keys (`subscriptionStatus`, `unityPets`) — **no Unity changes**.

---

## Subscriber namespace

Register a dedicated string id so Stripe-granted entitlements do not collide with `"demo"` or `"ocr-permit-v1"`:

```
subscriber = keccak256(abi.encode("stripe-v1", userWalletAddress))
```

The pet shop already ORs direct + x402 checks; add a third branch for `"stripe-v1"` the same way.

---

## What you do *not* need to rebuild

- Smart contracts (unless you want custom economics later)
- Ponder indexer (events are still `SubscriptionAdded` / `Extended` / `Renewed`)
- TypeScript SDK subscribe helpers (call the same `Asset.subscribe`)
- Unity bridge (`ocr:subscriptions` postMessage unchanged)
- Access primitive documentation

---

## Honest limits

- Treasury model introduces **float risk** and compliance (you hold fiat + USDC). That is operations, not protocol.
- Refunds/chargebacks need a product policy (revoke subscription off-chain, or `revokeSubscription` on-chain by asset owner).
- Stripe is not in the reference monorepo **yet** — this doc describes the extension path, not a shipped module.

---

## One-liner for stakeholders

> Stripe is a checkout adapter in front of the same frozen `subscribe()` call. The reference stack already proves the adapter pattern with x402; Stripe is the same shape with a different verifier. Because OCR is OSS, you ship that adapter yourself in days, not quarters — without forking the protocol.

---

## Related

- `OCR_PAYMENT_METHODS.md` — what is supported today
- `open-creator-rails.x402-adapter/` — clone this
- `open-creator-rails.demo/src/app/components/PetShopPaymentPicker.tsx` — add a third payment mode
