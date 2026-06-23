# Protocol Surface — ADDITIVE

**Version:** 0.1.0  
**Last updated:** 2026-04-22

> ADDITIVE means: these can be added to the protocol without breaking any existing
> downstream implementation. Existing code that doesn't use the new feature
> continues to work identically. No version bump required for additions alone,
> but new features MUST be documented here before being merged.

---

## A01 — subscriberController Mapping (proposed T007)

**Type:** New state + new functions + new event  
**Breaking:** No — purely additive to the Asset contract  
**Risk:** Authorization surface expands (see VERSIONED.md V01)

### What gets added

```solidity
// New state
mapping(bytes32 => address) internal subscriberController;
mapping(bytes32 => uint256) internal subscriberLinkNonces;

// New errors
error UnauthorizedSubscriptionCanceller();
error InvalidLinkDeadline();
error InvalidSubscriberLinkSignature();

// New event
event SubscriberLinked(bytes32 indexed subscriber, address indexed controller, uint256 nonce);

// New functions (view)
function getSubscriberController(bytes32 subscriber) external view returns (address);
function getSubscriberLinkNonce(bytes32 subscriber) external view returns (uint256);

// New function (write)
function linkSubscriber(
    bytes32 subscriber,
    address controller,
    uint256 deadline,
    bytes calldata signature
) external;
```

### What changes on existing functions

`cancelSubscription` authorization: from `onlyRegistry` to `onlyRegistry || msg.sender == subscriberController[subscriber]`

This is why T007 also appears in VERSIONED.md V01: the function signature is unchanged (ADDITIVE),
but the authorization semantics are changed (VERSIONED).

### Downstream impact assessment

| Downstream system | Impact | Notes |
|------------------|--------|-------|
| Indexers | Low — new event to handle | `SubscriberLinked` can be ignored; existing subscriptions work |
| TS SDK | Low — new methods to wrap | No existing calls break |
| Unity SDK | Low — new methods to wrap | No existing calls break |
| Demo app | Medium — cancel UX changes | Must handle unlinked subscribers |
| Security audits that assume onlyRegistry cancel | High | Trust model changes |
| Monitoring that alerts on unexpected cancel callers | High | Must update allow-list |

---

## A02 — AssetRegistryEntity on Indexer (required for T002)

**Type:** New indexer entity (Ponder schema addition)  
**Breaking:** No — purely additive  
**Required by:** Unity SDK `GetAssetRegistry` RPC fallback removal

```typescript
// Add to ponder.schema.ts
AssetRegistryEntity: {
  id: string,        // "{chainId}_{registryAddress}"
  address: string,
  chainId: number,
  owner: string,
  registryFeeShare: number,
  createdAt: bigint,
}
```

Populated by: listening to `AssetCreated` events on the registry (registry address
is `event.log.address`); owner can be read via RPC at index time.

---

## A03 — SubscriptionEvent Append-Only Log (required for T001)

**Type:** New indexer entity  
**Breaking:** No  

```typescript
SubscriptionEvent: {
  id: string,        // "{chainId}_{txHash}_{logIndex}"
  assetAddress: string,
  subscriberId: string,
  nonce: number,     // from SubscriptionAdded event
  payer: string,
  startTime: bigint,
  endTime: bigint,
  eventType: string, // "added" | "extended"
  blockNumber: bigint,
  transactionHash: string,
}
```

---

## A04 — Pricing Tiers / subscribeTier (T008)

**Type:** New state + new functions + new events  
**Breaking:** No — `subscribe()` is unchanged  
**Origin:** Important implementor request (Rob/Tanya) — discount annual plans  

### What gets added

```solidity
struct PricingTier { uint256 duration; uint256 totalPrice; }

mapping(uint256 => PricingTier) internal pricingTiers;
uint256 internal tierCount;

function setPricingTier(uint256 tierIndex, uint256 duration, uint256 totalPrice) external; // onlyOwner
function removePricingTier(uint256 tierIndex) external; // onlyOwner
function subscribeTier(bytes32 subscriber, address payer, address spender,
    uint256 tierIndex, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    external returns (uint256);
function getPricingTier(uint256 tierIndex) external view returns (uint256, uint256);
function getTierCount() external view returns (uint256);

event PricingTierSet(uint256 indexed tierIndex, uint256 duration, uint256 totalPrice);
event PricingTierRemoved(uint256 indexed tierIndex);
event TierSubscriptionAdded(bytes32 indexed subscriber, uint256 indexed tierIndex,
    uint256 indexed endTime, uint256 nonce, address payer);
```

### Key design decision

Tier subscriptions store `effectiveRate = totalPrice / duration` as `subscription.subscriptionPrice`.
This preserves the existing fee claim formula (`elapsed × subscriptionPrice`) without any
changes to `_claimable()` or the `Subscription` struct.

Constraint: `totalPrice ≤ subscriptionPrice × duration` (tiers may discount, not surcharge).

### Downstream impact

| System | Impact |
|--------|--------|
| Indexers | New entity `PricingTierEntity`; new event `TierSubscriptionAdded` |
| TS SDK | New methods; `subscribeTier` permit uses `totalPrice` |
| Unity SDK | New async methods |
| Demo | Tier selection UI with savings % |
| Existing `subscribe()` callers | Zero — unchanged |

---

## A05 — IAccessGrant Base Interface (T009)

**Type:** New Solidity interface  
**Breaking:** No — existing `IAsset` continues to exist unchanged as an alias/extension  
**Origin:** Protocol governance decision 2026-04-22 (confirmed by Martin Maurer)

### What gets added

```solidity
enum AssetType { Subscription, Product }

interface IAccessGrant {
    function getAssetId() external view returns (bytes32);
    function getRegistryAddress() external view returns (address);
    function getTokenAddress() external view returns (address);
    function getSubscription(bytes32 subscriber) external view returns (uint256);
    function isSubscriptionActive(bytes32 subscriber) external view returns (bool);
    function assetType() external view returns (AssetType);
}
```

`ISubscriptionAsset` (new name for current `IAsset`) extends `IAccessGrant`.
The existing `IAsset` name is kept as a type alias for one deprecation cycle.

### What changes on existing Asset.sol

- Inherits `IAccessGrant`
- Implements `assetType()` returning `AssetType.Subscription`
- All existing functions untouched

### Downstream impact

| System | Impact |
|--------|--------|
| All consumers that typed to `IAsset` | Zero — still works, `IAsset` alias kept |
| Consumers wanting polymorphic access checks | Now possible via `IAccessGrant` |
| Indexer | No schema change — `assetType` field already covers this |

---

## A06 — ProductAsset Contract + IProductAsset Interface (T009)

**Type:** New contract, new interface  
**Breaking:** No — entirely new address space, doesn't touch existing contracts  
**Origin:** T009

### What gets added

```solidity
interface IProductAsset is IAccessGrant {
    function getProductPrice() external view returns (uint256);
    function getProductDuration() external view returns (uint256);
    function setProductPrice(uint256 newPrice) external;
    function purchase(bytes32 subscriber, address payer, address spender,
        uint256 deadline, uint8 v, bytes32 r, bytes32 s) external returns (uint256);
}

// New events
event ProductPurchased(bytes32 indexed subscriber, address indexed payer, uint256 endTime);
event ProductPriceUpdated(uint256 newPrice);
```

Key behavioral differences from `Asset`:

| Property | Asset (Subscription) | ProductAsset |
|----------|---------------------|--------------|
| Price model | Per-second rate | Fixed total price |
| Duration | Caller-determined | Fixed at creation |
| Fee distribution | Pull-based (claim) | Push-based (immediate) |
| Cancel | Supported (with T007) | Not supported |
| Renewals | Stack additively | Reverts if already active |
| Refunds | Proportional to unused time | None |

---

## A07 — AssetRegistry.createProductAsset() (T009)

**Type:** New function on existing contract  
**Breaking:** No — existing `createAsset()` unchanged  
**New event:** `ProductAssetCreated` (does NOT replace or modify `AssetCreated`)

```solidity
function createProductAsset(
    bytes32 _assetId,
    uint256 _productPrice,
    uint256 _productDuration,
    address _tokenAddress,
    address _owner
) external onlyOwner returns (address);

event ProductAssetCreated(
    bytes32 indexed assetId,
    address indexed asset,
    uint256 productPrice,
    uint256 productDuration,
    address tokenAddress,
    address indexed owner
);
```

Note: `assetTypes` mapping (`assetId → AssetType`) is added to registry state so
callers can determine type without making a call to the asset contract itself.

---

## How to Add a New Additive Feature

1. Add an entry here in `ADDITIVE.md` before writing any code
2. If the addition also modifies the authorization of an existing function, add an entry in `VERSIONED.md`
3. Update `drift/CONFORMANCE.md` with any new cross-repo consistency checks
4. Create a task in `tasks/`
5. Only then: open PRs in implementation repos
