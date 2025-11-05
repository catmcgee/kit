[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]
<br />
[![code-style-prettier][code-style-prettier-image]][code-style-prettier-url]

[code-style-prettier-image]: https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square
[code-style-prettier-url]: https://github.com/prettier/prettier
[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/compat?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/compat?style=flat
[npm-url]: https://www.npmjs.com/package/@solana/compat

# @solana/compat

`@solana/compat` is a drop-in bridge from `@solana/web3.js` to Kit. Swap your web3.js
imports for `@solana/compat` and keep shipping while you migrate to Kit primitives at
your own pace.

## Quickstart

```ts
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/compat';

const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const payer = Keypair.generate();
const recipient = Keypair.generate();

// Fund the payer using any method you like (eg. Kit's `createSolanaRpc().requestAirdrop`).

const latestBlockhash = await connection.getLatestBlockhash('confirmed');
const tx = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: latestBlockhash.value.blockhash,
}).add(
    SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient.publicKey,
        lamports: 1_000_000,
    }),
);

await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
```

## API coverage (phase 0)

| Area | Status |
| --- | --- |
| Connection | `getLatestBlockhash`, `getBalance`, `getAccountInfo`, `getProgramAccounts`, `getSignatureStatuses`, `sendRawTransaction`, `confirmTransaction`, `simulateTransaction` |
| Primitives | Re-export `PublicKey`, `Keypair`, `Transaction`, `VersionedTransaction`, `TransactionInstruction` |
| Bridges | `toAddress`, `toPublicKey`, `toKitSigner`, `toWeb3Instruction`, `fromWeb3Instruction` |
| Programs | `SystemProgram.transfer` |
| Utils | `LAMPORTS_PER_SOL`, `sendAndConfirmTransaction`, `compileFromCompat` |
| Legacy helpers | `fromLegacyPublicKey`, `fromLegacyKeypair`, `fromVersionedTransaction`, `fromLegacyTransactionInstruction` |

Everything is tree-shakable (`"sideEffects": false`) and ships with CJS, ESM, and type
declarations.

## Converter utilities

The original converter helpers still ship unchanged:

- `fromLegacyPublicKey(publicKey)` → `Address`
- `fromLegacyKeypair(keypair)` → `CryptoKeyPair`
- `fromLegacyTransactionInstruction(instruction)` → Kit `Instruction`
- `fromVersionedTransaction(transaction)` → Kit `Transaction`

## Out-of-scope (documented)

- Subscriptions (`onLogs`, `onAccountChange`) are still provided by `@solana/web3.js`.
- Legacy `partialSign` mutation semantics are *not* guaranteed; prefer Kit signer lists.

Looking for more Kit-first patterns? Check [the Kit docs](https://www.solanakit.com/).
