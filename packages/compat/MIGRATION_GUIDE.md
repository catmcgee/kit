# @solana/compat Migration Guide (v1)

## Overview

The `@solana/compat` package is a drop-in bridge between the public
`@solana/web3.js` API and Kitʼs modular RPC, transaction, and instruction
primitives. Version 1 focuses on letting existing web3.js applications swap
imports while preserving behaviour.

## Quick Start

1. Add the package to your project (or update workspace refs):
   ```sh
   pnpm add @solana/compat
   ```
2. Replace `@solana/web3.js` imports with `@solana/compat` for the supported
   symbols listed below.
3. Run your existing tests/examples; the API surface mirrors web3.js and uses
   Kit under the hood.

## Import Mapping

### Supported replacements

You can import these directly from `@solana/compat` with no behaviour changes:

- `Connection`
- `SystemProgram`
- `sendAndConfirmTransaction`
- Constants such as `LAMPORTS_PER_SOL`

These APIs are backed by Kitʼs RPC and encoding layers while preserving the
original method signatures.

### Surfaces still backed by `@solana/web3.js`

- `Transaction`, `VersionedTransaction`, `TransactionInstruction`
- `Keypair`, `PublicKey`, and related signer types

For v1 the compat package re-exports these classes directly from web3.js. That
keeps constructor semantics, signing behaviour, and serialization exactly as
before. Kit-backed implementations are planned for version 2; until then you
can continue to use the familiar web3.js transaction APIs unchanged.

## Behaviour & Edge Cases

- **Transactions** – `Transaction`, `VersionedTransaction`, and
  `TransactionInstruction` are pass-through re-exports from `@solana/web3.js`
  in v1. Builders and serializers behave exactly as they do today; Kit-backed
  versions will arrive in a later release.
- **Connection** – RPC calls use Kit clients, but the method signatures and
  return shapes match web3.js (`getLatestBlockhash`, `getAccountInfo`,
  `getProgramAccounts`, `getSignatureStatuses`, `sendRawTransaction`,
  `confirmTransaction`, `simulateTransaction`). Commitment aliases such as
  `recent` or `single` are normalized automatically.
- **Encoding** – Base58/Base64 decoding uses Kit codecs instead of global
  `Buffer` helpers, so browser/Deno builds behave like Node.
- **Fallbacks** – WebSocket subscriptions and specialised helpers (e.g.
  `getParsedProgramAccounts`, nonce utilities, stake/vote program flows) are
  still provided by web3.js. Calls to these remain unchanged; they bypass the
  compat adapter until Kit implementations land in a later version.
- **Keypairs** – Continue to call `Keypair.generate()` from compat (it forwards
  to web3.js today). Future versions will introduce Kit-native signer factories
  with migration guidance.

## Migration Checklist

1. Swap imports to `@solana/compat` for the primitives listed above.
2. Verify any manual base58/base64 handling still succeeds (compat now always
   sends base64 wire transactions).
3. For code using `sendAndConfirmTransaction`, confirm custom `SendOptions`
   (`skipPreflight`, `maxRetries`, `preflightCommitment`) behave as before.
4. If you rely on websocket subscriptions or parsed-account helpers, keep
   importing those directly from `@solana/web3.js` until later compat releases.
5. Run the test suite (see coverage below); for CI, use:
   ```sh
   pnpm --filter @solana/compat test:unit:node
   pnpm --filter @solana/compat test:typecheck
   pnpm --filter @solana/compat compile:js
   pnpm --filter @solana/compat compile:typedefs
   ```

## Current Test Coverage

Our regression suites exercise the following scenarios:

- **Unit / Bridges** – Instruction round-tripping, legacy signer conversion,
  and address conversions (`src/__tests__/bridges-test.ts`).
- **Transactions** – Byte-for-byte comparison between compat-compiled
  transactions and manually constructed Kit transactions
  (`src/__tests__/compile-from-compat-test.ts`).
- **Integration** (`src/__tests__/integration-test.ts`):
  - Sending and confirming legacy transactions.
  - Submitting versioned transactions via `sendRawTransaction` (including
    `skipPreflight`/`maxRetries`).
  - `sendAndConfirmTransaction` with customised `SendOptions`.
  - `simulateTransaction` returning account data and logs.
  - `getProgramAccounts` shape verification and `dataSlice` support.
  - Commitment polling logic in `confirmTransaction`.
- **Core helpers** – Instruction serialization, transaction utilities, and
  keypair bridges through dedicated unit tests.

Refer to the `packages/compat/src/__tests__/` directory for full details and to
extend coverage when migrating additional APIs.


