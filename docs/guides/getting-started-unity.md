# Getting started: Unity

This guide orients you in the Unity SDK. For install URLs, supported Unity
versions, and wallet provider setup, follow the
[Unity SDK README](https://github.com/ChainSafe/open-creator-rails.unity/blob/main/README.md).

## 1. Install the package

Add the package via OpenUPM or a git package URL as documented in the README.

## 2. Scene setup

- Add one `OpenCreatorRailsService` to your scene (configures chain, RPC, and the
  wallet/embedded-wallet provider).
- Add one `Asset` component per on-chain asset whose subscriptions you want to
  track, pointing it at the asset's address.

## 3. Derive a subject

```csharp
byte[] subject = "my-app".ToSubscriberIdHash();           // connected wallet
byte[] subject = "my-app".ToSubscriberIdHash(address);     // explicit address
// keccak256(abi.encode("my-app", address)) — same as the TS SDK
```

## 4. Gate content

```csharp
bool active = await asset.IsSubscriptionActive("my-app");
if (active) {
    // unlock the level / item / feed
}
```

Other reads: `IsSubscriptionExpired`, `IsSubscriberRevoked`,
`GetSubscriptionExpiration`.

## 5. Subscribe & react to events

Trigger the subscribe flow (permit + transaction) per the README, and implement
`IAssetEventHandler` to react to `SubscriptionAdded` / `SubscriptionRenewed` /
`SubscriptionExtended` / `SubscriptionCancelled` / `SubscriptionRevoked`.

## Next

- [Unity SDK reference](../components/sdk-unity.md)
- [Protocol specification](../PROTOCOL.md)
