import type { Address } from '@solana/addresses';
import { AccountRole, type Instruction } from '@solana/instructions';
import { createSignerFromKeyPair, type KeyPairSigner } from '@solana/signers';
import type { PublicKeyInitData } from '@solana/web3.js';
import { Keypair, PublicKey, TransactionInstruction, type AccountMeta } from '@solana/web3.js';

import { fromLegacyKeypair } from './keypair';
import { fromLegacyTransactionInstruction } from './instruction';
import { toBuffer } from './internal/buffer';

type WithOptionalExtractable = {
    extractable?: boolean;
};

export type ToKitSignerConfig = Readonly<WithOptionalExtractable>;

export function toAddress<TAddress extends string = string>(input: PublicKey | PublicKeyInitData): Address<TAddress> {
    if (input instanceof PublicKey) {
        return input.toBase58() as Address<TAddress>;
    }
    return new PublicKey(input).toBase58() as Address<TAddress>;
}

export function toPublicKey(input: Address | PublicKeyInitData): PublicKey {
    return input instanceof PublicKey ? input : new PublicKey(input);
}

export async function toKitSigner(keypair: Keypair, config?: ToKitSignerConfig): Promise<KeyPairSigner> {
    const cryptoKeyPair = await fromLegacyKeypair(keypair, config?.extractable);
    return await createSignerFromKeyPair(cryptoKeyPair);
}

export function toWeb3Instruction(kitInstruction: Instruction): TransactionInstruction {
    const keys: AccountMeta[] = (kitInstruction.accounts ?? []).map(account => {
        const isSigner = account.role === AccountRole.READONLY_SIGNER || account.role === AccountRole.WRITABLE_SIGNER;
        const isWritable = account.role === AccountRole.WRITABLE || account.role === AccountRole.WRITABLE_SIGNER;
        return {
            isSigner,
            isWritable,
            pubkey: toPublicKey(account.address),
        } satisfies AccountMeta;
    });

    const data = kitInstruction.data ? toBuffer(Uint8Array.from(kitInstruction.data)) : undefined;

    return new TransactionInstruction({
        data: data as Buffer | undefined,
        keys,
        programId: toPublicKey(kitInstruction.programAddress),
    });
}

export const fromWeb3Instruction = fromLegacyTransactionInstruction;


