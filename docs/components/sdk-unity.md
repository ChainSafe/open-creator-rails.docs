# Unity SDK

Repo: [open-creator-rails.unity](https://github.com/ChainSafe/open-creator-rails.unity) ·
README: [open-creator-rails.unity/README.md](https://github.com/ChainSafe/open-creator-rails.unity/blob/main/README.md)

A C# SDK for Unity. Install via OpenUPM or a git package URL (see the README).
Add an `OpenCreatorRailsService` to your scene and one `Asset` component per
on-chain asset you want to track.

## Subscriber identity

```csharp
// keccak256(abi.encode(subscriberId, address)) — matches the TS SDK and contract
byte[] subject = subscriberId.ToSubscriberIdHash();              // uses connected wallet
byte[] subject = subscriberId.ToSubscriberIdHash(explicitAddress);
```

Defined in `Runtime/Utils/Extensions.cs`.

## Access checks

The `Asset` component exposes async checks that derive the subject internally via
`ToSubscriberIdHash()`:

- `IsSubscriptionActive(string subscriberId) → bool`
- `IsSubscriptionExpired(string subscriberId) → bool`
- `IsSubscriberRevoked(string subscriberId) → bool`
- `GetSubscriptionExpiration(string subscriberId) → DateTime`

## Events

`Asset` subscribes to contract events including `SubscriptionAdded`,
`SubscriptionRenewed`, `SubscriptionExtended`, `SubscriptionCancelled`,
`SubscriptionRevoked`, `SubscriptionUnrevoked`, and `OwnershipTransferred`,
dispatching them to registered `IAssetEventHandler` components.

## Platforms

The package ships an IL2CPP `link.xml` and is exercised through a WebGL
production build (the Pet Shop). See the README for platform notes and the
[Unity getting-started guide](../guides/getting-started-unity.md).
