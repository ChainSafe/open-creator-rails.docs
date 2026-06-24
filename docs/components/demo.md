# Demo — Pet Shop

Repo: [open-creator-rails.demo](https://github.com/ChainSafe/open-creator-rails.demo) ·
Story: [open-creator-rails.demo](https://github.com/ChainSafe/open-creator-rails.demo)

A React + Wagmi reference application ("on-chain Patreon") that exercises the full
stack: contracts, indexer, and the TypeScript SDK.

- **Live (Base Sepolia):** https://frontendpet-shop-production.up.railway.app

## How it gates content

The frontend decides access from the indexer's computed `Subscription.isActive`
field (`!isRevoked && startTime <= now < endTime`) — the same rule the indexer
applies server-side. Subscribing flows through the SDK's permit + `Asset.subscribe()`
path.

This demonstrates the intended division of responsibility: the application maps
the protocol's `isSubscriptionActive` signal to whatever "unlock" means in the
product (here, pet content), while the contract remains the source of truth.

## Running locally

The repo's README documents a multi-process local stack (Anvil + seed + indexer +
mock API + frontend) and a Base Sepolia mode via `.env.sepolia`. See the
[TypeScript getting-started guide](../guides/getting-started-typescript.md) and the
[indexer guide](../guides/running-the-indexer.md).
