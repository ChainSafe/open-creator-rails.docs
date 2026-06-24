# TypeScript SDK

Repo: [open-creator-rails.sdk](https://github.com/ChainSafe/open-creator-rails.sdk) ·
README: [open-creator-rails.sdk/README.md](https://github.com/ChainSafe/open-creator-rails.sdk/blob/main/README.md)

A web/Node SDK (`OcrSdk`) over [viem](https://viem.sh) for subscribing, reading
access state, and querying the indexer.

## Subscriber identity

```ts
import { subscriberHash } from "@chainsafe/open-creator-rails-sdk";
// keccak256(abi.encode(subscriberId /*string*/, subscriberAddress /*address*/))
const subscriber = subscriberHash("demo", walletAddress);
```

This is the canonical cross-SDK formula. Do not use address-only hashing.

## Reading access

The SDK reads access either on-chain (`isSubscriptionActive`) or from the indexer
(`source: "indexer" | "auto"`). `indexerUrl` is provided by the caller and
requires a chain id (`config.chainId` or a `publicClient` with a configured chain).

## Subscribe & cancel

- `subscribe(...)` builds an EIP-2612 permit (the user signs) and calls
  `Asset.subscribe(subscriber, payer, spender=asset, count, deadline, v, r, s)`.
- `cancelSubscription({ subscriberId, signature })` — single-step. The signature
  is an EIP-191 signature over `cancelSubscriptionDigest(chainId, assetAddress, subscriberHash(...))`
  = `keccak256(abi.encodePacked(uint256 chainId, address asset, bytes32 subscriber))`.

## Indexer client

`createSdkIndexer(indexerUrl, { chainId })` derives subject hashes via
`subscriberHash` and queries the indexer's v2 GraphQL API. Point `indexerUrl` at
your deployment's `/v2/graphql` endpoint.

See the [TypeScript getting-started guide](../guides/getting-started-typescript.md).
