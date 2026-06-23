# Running the indexer locally

The indexer is a [Ponder](https://ponder.sh) app in
[open-creator-rails.indexer](https://github.com/ChainSafe/open-creator-rails.indexer).
Use its `README.md` for exact, pinned commands; this guide explains the moving
parts.

## Prerequisites

- Node + a package manager (see the repo's `package.json` / lockfile)
- An RPC URL per chain you want to index

## Configure chains

Chains are **env-gated**: a chain is only indexed if its RPC env var is set.

| Chain | Chain ID | Env var |
|-------|----------|---------|
| Sepolia | 11155111 | `PONDER_RPC_URL_11155111` |
| Base Sepolia | 84532 | `PONDER_RPC_URL_84532` |
| Anvil (local) | 31337 | `PONDER_RPC_URL_31337` |

Registry addresses per chain are defined in the indexer's `config/`. `Asset`
contracts are discovered automatically via the `AssetCreated` factory event.

## Run

Start Ponder per the README (development command). The GraphQL API is served at:

```
http://localhost:42069/v2/graphql
```

Open that URL for the GraphiQL playground.

## Verify

Query a few entities:

```graphql
query {
  assets(limit: 5) { items { id subscriptionPrice } totalCount }
  activeSubscriptions(limit: 5) { items { id endTime payer } }
  _meta { status }
}
```

`_meta.status` shows the latest indexed block per chain — use it to confirm the
indexer has caught up.

## Notes

- A periodic `ClaimableRefresh` block job keeps the `SubscriberClaimable` rollup
  accurate even when no events fire (fees accrue at every period boundary).
- For deployment, see `scripts/railway-setup.sh` in the apex repo and the
  indexer README.

## Next

- [Indexer reference](../components/indexer.md)
- Full query reference: [queries.md](https://github.com/ChainSafe/open-creator-rails.indexer/blob/master/queries.md)
