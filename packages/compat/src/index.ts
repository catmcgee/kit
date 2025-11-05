import { ensureNodeRequire } from './internal/ensure-require';

if (typeof process !== 'undefined' && process.versions?.node) {
    ensureNodeRequire();
}

/**
 * This package contains utilities for converting from legacy web3.js classes to the data
 * structures in Kit. It can be used standalone, but it is also exported as part of Kit
 * [`@solana/kit`](https://github.com/anza-xyz/kit/tree/main/packages/kit).
 *
 * @packageDocumentation
 */
export * from './address';
export * from './instruction';
export * from './keypair';
export * from './transaction';

export { Connection } from './connection';
export { SystemProgram } from './programs/system';
export { LAMPORTS_PER_SOL } from './constants';
export { sendAndConfirmTransaction } from './utils/send-and-confirm-transaction';
export { compileFromCompat } from './utils/compile-from-compat';
export { toAddress, toPublicKey, toKitSigner, toWeb3Instruction, fromWeb3Instruction } from './bridges';

export { Keypair, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
