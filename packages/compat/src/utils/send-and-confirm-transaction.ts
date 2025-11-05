import type { SendOptions, Signer } from '@solana/web3.js';
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';

import { Connection } from '../connection';

type TransactionInput = Transaction | VersionedTransaction;

function cloneTransaction(transaction: TransactionInput): TransactionInput {
    if (transaction instanceof VersionedTransaction) {
        return VersionedTransaction.deserialize(transaction.serialize());
    }
    return Transaction.from(transaction.serialize({ requireAllSignatures: false }));
}

function signVersionedTransaction(transaction: VersionedTransaction, signers: readonly Signer[]) {
    const keypairs = signers.filter((signer): signer is Keypair => signer instanceof Keypair);
    if (keypairs.length) {
        transaction.sign(keypairs);
    }
}

function signLegacyTransaction(transaction: Transaction, signers: readonly Signer[]) {
    if (signers.length) {
        transaction.sign(...(signers as Signer[]));
    }
}

function normalizeCommitment(commitment?: string) {
    switch (commitment) {
        case 'recent':
            return 'confirmed';
        case 'single':
        case 'singleGossip':
            return 'processed';
        case 'processed':
        case 'confirmed':
        case 'finalized':
            return commitment;
        default:
            return undefined;
    }
}

export async function sendAndConfirmTransaction(
    connection: Connection,
    transaction: TransactionInput,
    signers: readonly Signer[] = [],
    options?: SendOptions,
): Promise<string> {
    const tx = cloneTransaction(transaction);
    if (tx instanceof VersionedTransaction) {
        signVersionedTransaction(tx, signers);
        const signature = await connection.sendRawTransaction(tx.serialize(), options);
        const confirmationCommitment = normalizeCommitment(options?.preflightCommitment ?? connection.commitment);
        if (confirmationCommitment) {
            await connection.confirmTransaction(signature, confirmationCommitment);
        } else {
            await connection.confirmTransaction(signature);
        }
        return signature;
    }

    signLegacyTransaction(tx, signers);
    const signature = await connection.sendRawTransaction(tx.serialize(), options);
    const confirmationCommitment = normalizeCommitment(options?.preflightCommitment ?? connection.commitment);
    if (confirmationCommitment) {
        await connection.confirmTransaction(signature, confirmationCommitment);
    } else {
        await connection.confirmTransaction(signature);
    }
    return signature;
}


