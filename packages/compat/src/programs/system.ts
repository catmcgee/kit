import { PublicKey, TransactionInstruction } from '@solana/web3.js';

import { toBuffer } from '../internal/buffer';

const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
const TRANSFER_INSTRUCTION_INDEX = 2;

export type SystemTransferParams = Readonly<{
    fromPubkey: PublicKey;
    toPubkey: PublicKey;
    lamports: number | bigint;
}>;

export const SystemProgram = {
    programId: SYSTEM_PROGRAM_ID,
    transfer({ fromPubkey, toPubkey, lamports }: SystemTransferParams): TransactionInstruction {
        const data = new Uint8Array(12);
        const view = new DataView(data.buffer);
        view.setUint32(0, TRANSFER_INSTRUCTION_INDEX, true);
        view.setBigUint64(4, BigInt(lamports), true);

        return new TransactionInstruction({
            data: toBuffer(data) as Buffer,
            keys: [
                { isSigner: true, isWritable: true, pubkey: fromPubkey },
                { isSigner: false, isWritable: true, pubkey: toPubkey },
            ],
            programId: SYSTEM_PROGRAM_ID,
        });
    },
};


