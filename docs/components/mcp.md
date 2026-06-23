# MCP Server

Repo: [open-creator-rails.mcp](https://github.com/ChainSafe/open-creator-rails.mcp) ·
README: [open-creator-rails.mcp/README.md](https://github.com/ChainSafe/open-creator-rails.mcp/blob/main/README.md) ·
Design: [docs/design.md](https://github.com/ChainSafe/open-creator-rails.mcp/blob/main/docs/design.md)

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
OCR operations as AI-callable tools (Claude Desktop, Cursor, etc.), so creators
and agents can manage assets and subscriptions through an AI interface.

## Subscriber identity

The MCP server derives subjects with the canonical formula:

```ts
// keccak256(abi.encode(subscriberId, subscriberAddress))
deriveSubscriberId(subscriberId, address)
```

defined in `src/subscriber.ts`, consistent with the TypeScript and Unity SDKs.

## Configuration

The README documents the tool table, required environment (RPC URL, registry
address, operator key), and Claude Desktop configuration. Operator-sponsored
flows sign an EIP-2612 permit where the operator wallet is both owner and payer
(`src/permit.ts`).
