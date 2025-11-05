import type { Blockhash } from '@solana/rpc-types';
import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/transaction-messages';
import { compileTransaction } from '@solana/transactions';
import { Keypair } from '@solana/web3.js';

import { toAddress } from '../bridges';
import { compileFromCompat } from '../utils/compile-from-compat';
import { SystemProgram } from '../programs/system';
import { fromLegacyTransactionInstruction } from '../instruction';

describe('compileFromCompat', () => {
    it('produces identical bytes to a Kit-built transaction', () => {
        const payer = Keypair.generate();
        const recipient = Keypair.generate();
        const latestBlockhash = {
            blockhash: Keypair.generate().publicKey.toBase58(),
            lastValidBlockHeight: 123,
        };

        const transferInstruction = SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            lamports: 5000,
            toPubkey: recipient.publicKey,
        });

        const compatTransaction = compileFromCompat({
            feePayer: payer.publicKey,
            instructions: [transferInstruction],
            latestBlockhash,
        });

        const feePayerMessage = setTransactionMessageFeePayer(
            toAddress(payer.publicKey),
            createTransactionMessage({ version: 0 }),
        );
        const withInstruction = appendTransactionMessageInstructions(
            [fromLegacyTransactionInstruction(transferInstruction)],
            feePayerMessage,
        ) as unknown as typeof feePayerMessage;
        const withLifetime = setTransactionMessageLifetimeUsingBlockhash(
            {
                blockhash: latestBlockhash.blockhash as Blockhash,
                lastValidBlockHeight: BigInt(latestBlockhash.lastValidBlockHeight),
            },
            withInstruction,
        ) as unknown as typeof withInstruction;

        const kitTransaction = compileTransaction(withLifetime as unknown as Parameters<typeof compileTransaction>[0]);

        expect(compatTransaction.messageBytes).toStrictEqual(kitTransaction.messageBytes);
        expect(compatTransaction.signatures).toStrictEqual(kitTransaction.signatures);
    });
});


