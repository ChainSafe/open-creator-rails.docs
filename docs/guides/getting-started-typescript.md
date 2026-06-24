# Getting started: TypeScript

This guide orients you in the TypeScript stack. For exact, version-pinned
commands always defer to each repo's `README.md` and `package.json` scripts.

## 1. Install the SDK

The SDK lives in [open-creator-rails.sdk](https://github.com/ChainSafe/open-creator-rails.sdk).
Follow its README for the published package name and install command. The SDK
depends on [viem](https://viem.sh) and targets the OCR contracts.

## 2. Derive a subject

```ts
import { subscriberHash } from "@chainsafe/open-creator-rails-sdk";

const subscriber = subscriberHash("my-app", walletAddress);
// keccak256(abi.encode("my-app", walletAddress))
```

Pick a stable `subscriberId` string per application namespace and keep it
consistent — it is part of the subject identity.

## 3. Check access

Read on-chain, or from an indexer if you configured `indexerUrl` (+ chain id):

```ts
// on-chain truth
const active = await asset.read.isSubscriptionActive([subscriber]);
```

`active` is `true` only when the subscription is neither expired nor revoked.

## 4. Subscribe

The SDK builds an EIP-2612 permit (the user signs in their wallet) and calls
`Asset.subscribe(subscriber, payer, spender=asset, count, deadline, v, r, s)`.
`count` is the number of whole periods; the charge is `count * subscriptionPrice`.

## 5. Cancel

```ts
await sdk.cancelSubscription({ subscriberId, signature });
```

`signature` is an EIP-191 signature over
`cancelSubscriptionDigest(chainId, assetAddress, subscriberHash(subscriberId, wallet))`.

## 6. Run the demo

The [Pet Shop demo](../components/demo.md) is a complete reference. Its README
documents a local stack (Anvil + indexer + frontend) and a Base Sepolia mode.

## Next

- [TypeScript SDK reference](../components/sdk-typescript.md)
- [Indexer API](../components/indexer.md)
- [Running the indexer locally](running-the-indexer.md)
