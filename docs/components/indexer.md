# Indexer

Repo: [open-creator-rails.indexer](https://github.com/ChainSafe/open-creator-rails.indexer) ·
Built on [Ponder](https://ponder.sh)

Ingests `AssetRegistry` and `Asset` events and exposes a read API. On-chain state
remains authoritative; the indexer is an acceleration layer.

## API

- **Recommended endpoint:** `/v2/graphql` (GraphiQL playground at the same path)
- **Production:** https://indexer-api-production-c33d.up.railway.app/v2/graphql
- **Local:** `http://localhost:42069/v2/graphql`

Full query reference and schema:
- [GraphQL queries](https://github.com/ChainSafe/open-creator-rails.indexer/blob/master/queries.md)
- [Data model](https://github.com/ChainSafe/open-creator-rails.indexer/blob/master/data-model.md)
- [Architecture](https://github.com/ChainSafe/open-creator-rails.indexer/blob/master/architecture.md)
- [ponder.config.ts](https://github.com/ChainSafe/open-creator-rails.indexer/blob/master/ponder.config.ts)

## Entities

| Entity | Primary key |
|--------|-------------|
| `RegistryEntity` | `{chainId}_{registryAddress}` |
| `AssetEntity` | `{chainId}_{assetAddress}` |
| `Subscription` | `{chainId}_{assetAddress}_{subscriber}_{nonce}` |
| `SubscriberClaimable` | per `(asset, subscriber)` claimable-fee rollup |

A `Subscription` stores `startTime`, `endTime`, `nonce`, `payer`,
`subscriptionPrice`, `registryFeeShare`, and `isRevoked` (owner revocation only —
it does not capture time-based expiry).

## Queries

`registries`, `assets`, `subscriptions`, `activeSubscriptions`,
`expiringSubscriptions(within: BigInt!)`, plus per-event log queries and `_meta`.

All list queries share pagination/ordering args: `where` (equality-only),
`orderBy`, `orderDirection` (`asc`/`desc`), `limit` (default 50, max 1000),
`offset`. Each returns `{ items, pageInfo, totalCount }`.

### Active-subscription semantics

Two related computations — both require that the subscriber is **not revoked**
and the current time is within the subscription window:

- Computed field `Subscription.isActive` = `!isRevoked && startTime <= now < endTime`
- `activeSubscriptions` query filter = `!isRevoked && startTime < now && endTime > now`

Consumers MUST treat activity as time-bounded; `isRevoked` alone is not enough,
because it does not encode expiry.

## Networks

Chains are enabled by `PONDER_RPC_URL_<chainId>` env vars: Sepolia (`11155111`),
Base Sepolia (`84532`), local Anvil (`31337`).

See the [running the indexer](../guides/running-the-indexer.md) guide for local setup.
