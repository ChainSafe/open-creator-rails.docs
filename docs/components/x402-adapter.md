# x402 Adapter

Repo: [open-creator-rails.x402-adapter](https://github.com/ChainSafe/open-creator-rails.x402-adapter) ·
Docs: [docs/](https://github.com/ChainSafe/open-creator-rails.x402-adapter/tree/main/docs)
(`architecture.md`, `ocr-permit-v1.md`, `IPaymentAdapter.md`, `integration-guide.md`, `security.md`)

An [x402](https://x402.org) facilitator that lets an HTTP client (browser, AI
agent, game) pay for an OCR subscription. It bridges an HTTP 402 payment flow to
`Asset.subscribe()`.

## Scheme: `ocr-permit-v1`

The scheme uses an **EIP-2612 permit** (not EIP-3009). The client signs a permit
with `payer = self` and `spender = Asset`; the facilitator broadcasts
`Asset.subscribe()`.

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /supported` | Advertise supported scheme/network |
| `POST /verify` | Validate the permit signature, nonce, deadline, idempotency |
| `POST /settle` | Broadcast `Asset.subscribe()` |

## Non-custodial guarantee

The facilitator pays gas only. Tokens flow `payer → Asset`; the facilitator never
appears as `payer` and cannot redirect funds because the contract enforces
`spender == address(this)`.

## Subscriber namespace

x402 subjects use a fixed string namespace:

```
keccak256(abi.encode("ocr-permit-v1", userAddress))
```

This is a **distinct identity namespace** from application SDK subscriber ids
(e.g. `"demo"`). It is intentional, not a bug — a user self-cancels an x402
subscription by calling `cancelSubscription("ocr-permit-v1", signature)` from the
same wallet.

## Idempotency

The settle path is keyed by `(payer, permitNonce)`. The reference store is
in-memory; production deployments should swap in a persistent store (tracked as
issue `x402-adapter#1`).

See also [OCR payment methods](../OCR_PAYMENT_METHODS.md).
