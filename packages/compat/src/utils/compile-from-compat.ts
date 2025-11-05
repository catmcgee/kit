import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/transaction-messages';
import { compileTransaction, type Transaction } from '@solana/transactions';
import type { Blockhash } from '@solana/rpc-types';
import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

import { toAddress } from '../bridges';
import { fromLegacyTransactionInstruction } from '../instruction';

export type CompileFromCompatParams = Readonly<{
    feePayer: PublicKey;
    instructions: readonly TransactionInstruction[];
    latestBlockhash: Readonly<{
        blockhash: string;
        lastValidBlockHeight: number | bigint;
    }>;
}>;

export function compileFromCompat(params: CompileFromCompatParams): Transaction {
    const blockhashLifetime = {
        blockhash: params.latestBlockhash.blockhash as Blockhash,
        lastValidBlockHeight: BigInt(params.latestBlockhash.lastValidBlockHeight),
    };

    const feePayerAddress = toAddress(params.feePayer);
    const instructions = params.instructions.map(fromLegacyTransactionInstruction);

    const messageWithFeePayer = setTransactionMessageFeePayer(
        feePayerAddress,
        createTransactionMessage({ version: 0 }),
    );
    const messageWithInstructions = appendTransactionMessageInstructions(instructions, messageWithFeePayer) as typeof messageWithFeePayer;
    const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(blockhashLifetime, messageWithInstructions) as typeof messageWithInstructions;

    return compileTransaction(messageWithLifetime as Parameters<typeof compileTransaction>[0]);
}


