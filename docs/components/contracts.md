# Contracts

Repo: [open-creator-rails](https://github.com/ChainSafe/open-creator-rails) ·
Source: `src/Asset.sol`, `src/AssetRegistry.sol`, `src/IAsset.sol`

The contracts are the source of truth for all access decisions. Everything else
(indexer, SDKs, demo) is an acceleration layer.

## AssetRegistry

Factory and fee authority. `createAsset` is restricted to the registry owner.

| Function | Notes |
|----------|-------|
| `createAsset(bytes32 assetId, uint256 subscriptionPrice, uint256 subscriptionDuration, address token, address owner)` | Owner-only. Deploys an `Asset` clone, emits `AssetCreated`. |
| `getAsset(bytes32 assetId) → address` | Reverts if unknown. |
| `getRegistryFeeShare() → uint256` | Integer percent `[0,100]`. |
| `getCreatorFeeShare() → uint256` | Returns `100 - registryFeeShare`. |
| `updateRegistryFeeShare(uint256)` | Owner-only; reverts if `> 100`. |
| `subscribe(assetId, ...)` | Forwards to the asset. |

`AssetCreated(assetId, assetAddress, subscriptionPrice, subscriptionDuration, tokenAddress, owner)` — `assetId`, `assetAddress`, `owner` indexed.

## Asset

One deployed `Asset` per subscribable resource.

### Access checks (view)

| Function | Meaning |
|----------|---------|
| `isSubscriptionActive(bytes32 subscriber) → bool` | `!expired && !revoked` — the canonical access check |
| `isSubscriptionExpired(bytes32 subscriber) → bool` | `getSubscriptionExpiration(subscriber) <= block.timestamp` (the `endTime` instant is expired) |
| `isSubscriberRevoked(bytes32 subscriber) → bool` | Owner has revoked this subscriber |
| `getSubscriptionExpiration(bytes32 subscriber) → uint256` | Expiry for the current nonce; `0` if none |

### subscribe

```solidity
function subscribe(
    bytes32 subscriber,
    address payer,
    address spender,   // MUST equal address(this)
    uint256 count,     // number of whole periods, > 0
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
) external returns (uint256 endTime);
```

- Charge is `count * subscriptionPrice`; time added is `count * SUBSCRIPTION_DURATION`.
- `_validatePermit` requires `spender == address(this)`, calls EIP-2612 `permit`,
  then `safeTransferFrom(payer → Asset)`. Full payment is **held in the Asset**.
- Lifecycle event:
  - first subscription → `SubscriptionAdded(subscriber, startTime, endTime, payer, subscriptionPrice, registryFeeShare)`
  - still active, same payer/price/feeShare → in-place `SubscriptionExtended(subscriber, endTime)`
  - terms changed or lapsed → new nonce → `SubscriptionRenewed(subscriber, startTime, endTime, nonce, payer, subscriptionPrice, registryFeeShare)`

### Subscriber identity

The `bytes32 subscriber` is derived off-chain as
`keccak256(abi.encode(subscriberId /*string*/, walletAddress))`. Storage records
are keyed by `keccak256(abi.encode(subscriber, nonce))`.

### Cancel / revoke

| Function | Caller | Effect |
|----------|--------|--------|
| `cancelSubscription(string subscriberId, bytes signature)` | Subscriber (self) | Single-step. Derives `subscriber = keccak256(abi.encode(subscriberId, msg.sender))`; verifies an EIP-191 signature over `keccak256(abi.encodePacked(chainid, address(this), subscriber))`; refunds whole remaining periods to `payer`. |
| `revokeSubscription(bytes32 subscriber)` | Asset owner | Refunds all remaining time (incl. partial-period dust) to `payer`; marks subscriber revoked. |
| `unrevokeSubscription(bytes32 subscriber)` | Asset owner | Lifts revocation. |

There is no two-step commit-reveal and no `commitCancellation` function.

### Fees (pull-based)

`fee = count * subscriptionPrice (+ dust)` accrues over elapsed periods.
`registryFee = fee * registryFeeShare / 100`; the creator receives `fee - registryFee`.

| Function | Caller |
|----------|--------|
| `claimCreatorFee(bytes32)` / `claimCreatorFee(bytes32[])` | Asset owner |
| `claimRegistryFee(bytes32)` / `claimRegistryFee(bytes32[])` | Registry |

## Deeper reference

- [Execution flows](https://github.com/ChainSafe/open-creator-rails/blob/main/docs/execution-flows.md)
- [Gas benchmarks](https://github.com/ChainSafe/open-creator-rails/blob/main/docs/gas-benchmarks.md)
- [SDK class diagram](https://github.com/ChainSafe/open-creator-rails/blob/main/docs/sdk-class-diagram.md)
