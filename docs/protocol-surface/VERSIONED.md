# Protocol Surface — VERSIONED

**Version:** 0.1.0  
**Last updated:** 2026-04-22

> VERSIONED means: these can change, but only with an explicit protocol version bump,
> a documented migration path, and communication to known implementors.
> Assume that changing anything here requires at minimum a MINOR version bump,
> and anything that changes observable authorization or state structure requires MAJOR.

---

## V01 — cancelSubscription Authorization Model

**Current state:** `onlyRegistry`  
**Proposed change (T007):** Also allow `subscriberController[subscriber]`  
**Version impact:** MAJOR — changes who can trigger state changes (refunds, subscription removal)

### Why MAJOR and not MINOR

Downstream systems that have modeled cancel as an admin-only operation may have:
- Access control lists that only whitelist registry-originated cancel calls
- Monitoring/alerting that flags unexpected cancel events as security incidents
- Smart contract wrappers that call `cancelSubscription` assuming it's gated by registry

The on-chain state change (subscription removed, payer refunded) is identical regardless
of caller. The event (`SubscriptionCancelled`) is identical. But the authorization model
— who has the power to trigger this — is changing. That is a trust-model change.

**Migration path for T007:**
1. Deploy new contracts with dual auth
2. Publish as v2 (new registry + new asset implementation)
3. Old deployments remain as v1 (legacy, no breaking change to existing assets)
4. New assets are deployed under v2 registry
5. Document: "v1 assets: cancel by registry only. v2 assets: cancel by registry or linked controller."

---

## V02 — createAsset Access Control

**Current state:** `onlyOwner` (only registry owner can create assets)  
**Intended state:** Open to any creator (per original product vision)  
**Version impact:** MAJOR — changes who can introduce new resources into the system

**Note:** The current `onlyOwner` constraint is likely a deliberate early-stage design
choice (registry owner curates which assets exist). The product vision of
"any creator can deploy an asset" would require either:
- Removing `onlyOwner` (permissionless registry)
- Adding a whitelist/allowlist mechanism
- Requiring a stake/deposit to create assets

This is a governance question, not just a technical one.

---

## V03 — Fee Share Precision

**Current state:** `registryFeeShare` is `uint256`, range 0–100 (integer percent)  
**Potential change:** Move to basis points (0–10000) for finer-grained splits  
**Version impact:** MINOR if additive (add bps variant alongside percent), MAJOR if replacement

**Note:** The current `/ 100` in fee calculations means the minimum fee granularity
is 1% of subscription revenue. Moving to basis points (`/ 10000`) allows
0.01% granularity. If this changes, every claim calculation in every indexer
that has replicated the fee formula is affected.

---

## V04 — Subscription Data Model (nonce structure)

**Current state:** Multiple subscription records per subscriber, keyed by
`keccak256(abi.encode(subscriber, nonce))`. New nonce when price/fee/payer changes.

**Potential simplification:** Single record per subscriber (always overwrite).
This would break any indexer that tracks subscription history per nonce,
and break the refund logic for pre-paid future periods.

**Version impact:** MAJOR. Do not change without comprehensive migration plan.

---

## V05 — spender Parameter in subscribe()

**Current state:** `spender` is passed explicitly and validated as `address(this)`.
**Potential change:** Remove `spender`, hardcode `address(this)` internally.
**Version impact:** MAJOR — ABI change.

This parameter exists for validation clarity (the caller confirms they're authorizing
the right contract). Removing it simplifies the interface but breaks any SDK that
constructs the call with `spender`.
