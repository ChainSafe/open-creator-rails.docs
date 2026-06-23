# Protocol Surface — FROZEN

**Version:** 0.1.0  
**Last updated:** 2026-04-22  
**Source:** Read directly from `open-creator-rails/src/` and `open-creator-rails/test/`

> FROZEN means: downstream implementors MAY treat these as permanent invariants.
> Any change here requires a MAJOR protocol version bump, coordinated migration
> across all known implementations, and a public deprecation period.
> Assume unknown implementors exist who have already baked these into their systems.

---

## 1. Core Primitive

```
subscriptions[keccak256(abi.encode(subscriber, nonce))] → Subscription{
    startTime, endTime, subscriptionPrice, registryFeeShare, payer
}
```

The observable access check — the one thing every downstream system ultimately depends on:

```solidity
isSubscriptionActive(bytes32 subscriber) → bool
// implemented as: getSubscription(subscriber) > block.timestamp
// where getSubscription returns subscriptions[_hash(subscriber, nonces[subscriber])].endTime
```

**The primitive is `(subscriber, asset) → bool` at any point in time.**  
This is the one thing that MUST never change semantics.

---

## 2. Subscriber Identity

`subscriber` is an **arbitrary `bytes32`**. The contracts impose no constraints on how
this value is derived. The convention `keccak256(abi.encodePacked(address))` is
an SDK/application-layer concern, not enforced on-chain.

**FROZEN:** The parameter type is `bytes32`. No migration to `address` or any other
type is permitted without a major version.

---

## 3. Exact Function Signatures (IAsset)

These are the deployed ABI. Changing any signature breaks every SDK that compiled
against this ABI.

```solidity
function getAssetId() external view returns (bytes32);
function getRegistryAddress() external view returns (address);
function getTokenAddress() external view returns (address);
function getSubscriptionPrice(uint256 duration) external view returns (uint256);
function setSubscriptionPrice(uint256 newSubscriptionPrice) external;
function getSubscription(bytes32 subscriber) external view returns (uint256);
function isSubscriptionActive(bytes32 subscriber) external view returns (bool);

function subscribe(
    bytes32 subscriber,
    address payer,
    address spender,   // MUST equal address(this); validated on-chain
    uint256 value,     // payment amount; duration = value / subscriptionPrice
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external returns (uint256);  // returns subscription endTime

function claimCreatorFee(bytes32 subscriber) external returns (uint256);
function claimCreatorFee(bytes32[] calldata subscribers) external returns (uint256);
function claimRegistryFee(bytes32 subscriber) external returns (uint256);
function claimRegistryFee(bytes32[] calldata subscribers) external returns (uint256);
function revokeSubscription(bytes32 subscriber) external;
function cancelSubscription(bytes32 subscriber) external;
```

---

## 4. Exact Function Signatures (IAssetRegistry)

```solidity
function createAsset(bytes32 _assetId, uint256 _subscriptionPrice, address _tokenAddress, address _owner)
    external returns (address);
function viewAsset(bytes32 _assetId) external view returns (bool);
function getAsset(bytes32 _assetId) external view returns (address);
function isSubscriptionActive(bytes32 _assetId, bytes32 _subscriber) external view returns (bool);
function getSubscription(bytes32 _assetId, bytes32 _subscriber) external view returns (uint256);
function getSubscriptionPrice(bytes32 _assetId, uint256 _duration) external view returns (uint256);
function subscribe(bytes32 _assetId, bytes32 _subscriber, address _payer, address _spender,
    uint256 _value, uint256 _deadline, uint8 _v, bytes32 _r, bytes32 _s) external returns (uint256);
function getCreatorFeeShare() external view returns (uint256);
function getRegistryFeeShare() external view returns (uint256);
function getFeeShares() external view returns (uint256 creatorFeeShare, uint256 registryFeeShare);
function updateRegistryFeeShare(uint256 _registryFeeShare) external;
function getCreatorFee(uint256 _value) external view returns (uint256);
function getRegistryFee(uint256 _value) external view returns (uint256);
function getFees(uint256 _value) external view returns (uint256 creatorFee, uint256 registryFee);
function claimRegistryFee(bytes32 _assetId, bytes32 _subscriber) external returns (uint256);
function claimRegistryFee(bytes32 _assetId, bytes32[] calldata _subscribers) external returns (uint256);
function cancelSubscription(bytes32 _assetId, bytes32 _subscriber) external;
function getOwner() external view returns (address);
```

---

## 5. Exact Event Signatures

Indexers compile against these. Any change to an event signature breaks all indexers.

### Asset events

```solidity
event SubscriptionAdded(
    bytes32 indexed subscriber,
    uint256 indexed startTime,
    uint256 indexed endTime,
    uint256 nonce,
    address payer
);
event SubscriptionExtended(
    bytes32 indexed subscriber,
    uint256 indexed endTime
);
event SubscriptionRevoked(bytes32 indexed subscriber);
event SubscriptionCancelled(bytes32 indexed subscriber);
event CreatorFeeClaimed(bytes32 indexed subscriber, uint256 amount);
event SubscriptionPriceUpdated(uint256 newSubscriptionPrice);
```

### AssetRegistry events

```solidity
event AssetCreated(
    bytes32 indexed assetId,
    address indexed asset,
    uint256 subscriptionPrice,
    address tokenAddress,
    address indexed owner
);
event RegistryFeeShareUpdated(uint256 newRegistryFeeShare);
event RegistryFeeClaimed(bytes32 indexed subscriber, uint256 amount);
event RegistryFeeClaimedBatch(bytes32 indexed assetId, bytes32[] indexed subscribers, uint256 totalAmount);
```

---

## 6. Fee Model Invariants

These invariants downstream systems may rely on:

1. **All subscription payment is held in the Asset contract** at time of `subscribe()`.
   Tokens are NOT distributed at subscribe time.

2. **Creator claims via `claimCreatorFee()`; Registry claims via `claimRegistryFee()`.**
   Both are pull-based. Neither is called automatically.

3. **Fee split formula** (percentage, not basis points):
   ```
   registryFee = elapsed_seconds * subscriptionPrice * registryFeeShare / 100
   creatorFee  = elapsed_seconds * subscriptionPrice * (100 - registryFeeShare) / 100
   ```
   `registryFeeShare` is always `0 ≤ n ≤ 100`.

4. **On cancel/revoke, unused time is refunded to `subscription.payer`** (not to `subscriber`).
   The refund is proportional: `(endTime - block.timestamp) * subscriptionPrice` for active,
   `(endTime - startTime) * subscriptionPrice` for not-yet-started subscriptions.
   Already-elapsed time is NOT refunded.

---

## 7. Authorization Invariants (Current State — under change request)

| Operation | Current authorizer | Notes |
|-----------|-------------------|-------|
| `revokeSubscription` | Asset owner (creator) | Refunds payer |
| `cancelSubscription` on Asset | Registry address only (`onlyRegistry`) | Refunds payer |
| `cancelSubscription` on Registry | Registry owner (`onlyOwner`) | Calls Asset.cancelSubscription |
| `claimCreatorFee` | Asset owner | — |
| `claimRegistryFee` on Asset | Registry address | — |
| `claimRegistryFee` on Registry | Registry owner | — |
| `setSubscriptionPrice` | Asset owner | — |
| `updateRegistryFeeShare` | Registry owner | — |
| `createAsset` | Registry owner | NOT open to any creator |

> **Note:** `IAsset.cancelSubscription` NatSpec says "Callable by the asset owner or
> the subscription payer" — this is **incorrect** in the current implementation.
> The implementation is `onlyRegistry`. The NatSpec is the bug, not the code.
> Change request T007 proposes adding a third authorized caller (subscriberController).
> See `VERSIONED.md` and `tasks/T007`.

---

## 8. Subscription Nonce Semantics

A single subscriber can have multiple concurrent subscription records, keyed by
`keccak256(abi.encode(subscriber, nonce))`. A new nonce is created (new record)
when renewal occurs with changed conditions:

- Different `subscriptionPrice` (price was updated between subscribes)
- Different `registryFeeShare` (registry updated fees between subscribes)
- Different `payer` (new wallet pays for the renewal)
- Subscription had already expired when renewal occurs

In-place extension (same nonce, `endTime` updated) occurs only when all four
conditions are the same AND the subscription is still active at renewal time.

**FROZEN:** The existence and semantics of nonces are part of the data model.
Indexers that store subscription history per nonce have built on this.

---

## 9. Payment Token Requirements

- MUST implement ERC-20
- MUST implement EIP-2612 (`permit`)
- `spender` in `subscribe()` MUST equal `address(asset)` — validated on-chain

---

## 10. What Is NOT Frozen

Refer to `VERSIONED.md` and `ADDITIVE.md` for:
- Access control on `cancelSubscription` (proposed T007)
- `createAsset` access control model
- Fee share range and precision
- New mappings and events
