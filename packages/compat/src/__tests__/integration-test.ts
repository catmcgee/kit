import { address } from '@solana/addresses';
import { createSolanaRpc } from '@solana/rpc';
import { Keypair, PublicKey, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { lamports } from '@solana/rpc-types';

import { Connection, LAMPORTS_PER_SOL, SystemProgram, sendAndConfirmTransaction } from '..';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899';
const AIRDROP_TARGET = LAMPORTS_PER_SOL * 2;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60_000;

async function wait(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureBalance(connection: Connection, keypair: Keypair, targetLamports: number = AIRDROP_TARGET) {
    const rpc = createSolanaRpc(connection.rpcEndpoint);
    const signature = await rpc
        .requestAirdrop(address(keypair.publicKey.toBase58()), lamports(BigInt(targetLamports)))
        .send();
    await connection.confirmTransaction(signature, 'confirmed');
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const balance = await connection.getBalance(keypair.publicKey, 'confirmed');
        if (balance >= targetLamports) {
            return;
        }
        await wait(POLL_INTERVAL_MS);
    }
    throw new Error('Timed out waiting for airdrop balance');
}

describe('compat integration', () => {
    jest.setTimeout(120_000);

    let connection: Connection;
    beforeAll(() => {
        connection = new Connection(RPC_URL, 'confirmed');
    });

    it('sends and confirms legacy transactions', async () => {
        expect.assertions(2);

        const payer = Keypair.generate();
        const recipient = Keypair.generate();

        await ensureBalance(connection, payer);

        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        const legacyTransaction = new Transaction({
            feePayer: payer.publicKey,
            recentBlockhash: latestBlockhash.value.blockhash,
        }).add(
            SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                lamports: 1_000_000,
                toPubkey: recipient.publicKey,
            }),
        );

        const signature = await sendAndConfirmTransaction(connection, legacyTransaction, [payer]);
        expect(typeof signature).toBe('string');
        const recipientBalance = await connection.getBalance(recipient.publicKey, 'confirmed');
        expect(recipientBalance).toBeGreaterThanOrEqual(1_000_000);
    });

    it('sends versioned transactions with sendRawTransaction', async () => {
        expect.assertions(3);

        const payer = Keypair.generate();
        const recipient = Keypair.generate();

        await ensureBalance(connection, payer);
        await ensureBalance(connection, recipient);

        const { value: latestBlockhash } = await connection.getLatestBlockhash('confirmed');
        const initialRecipientBalance = await connection.getBalance(recipient.publicKey, 'confirmed');
        const targetLamports = 1_000_000;
        const message = new TransactionMessage({
            instructions: [
                SystemProgram.transfer({
                    fromPubkey: payer.publicKey,
                    lamports: targetLamports,
                    toPubkey: recipient.publicKey,
                }),
            ],
            payerKey: payer.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
        }).compileToV0Message();

        const versionedTransaction = new VersionedTransaction(message);
        versionedTransaction.sign([payer]);

        const signature = await connection.sendRawTransaction(versionedTransaction, {
            skipPreflight: true,
            maxRetries: 1,
        });
        expect(typeof signature).toBe('string');

        await connection.confirmTransaction(signature, 'finalized');

        const statuses = await connection.getSignatureStatuses([signature]);
        expect(statuses.value[0]?.err ?? null).toBeNull();

        let recipientBalance = initialRecipientBalance;
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
            recipientBalance = await connection.getBalance(recipient.publicKey, 'confirmed');
            if (recipientBalance >= initialRecipientBalance + targetLamports) {
                break;
            }
            await wait(POLL_INTERVAL_MS);
        }
        expect(recipientBalance).toBeGreaterThanOrEqual(initialRecipientBalance + targetLamports);
    });

    it('sendAndConfirmTransaction accepts custom send options', async () => {
        expect.assertions(2);

        const payer = Keypair.generate();
        const recipient = Keypair.generate();

        await ensureBalance(connection, payer);

        const { value: latestBlockhash } = await connection.getLatestBlockhash('confirmed');
        const transaction = new Transaction({
            feePayer: payer.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
        }).add(
            SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                lamports: 750_000,
                toPubkey: recipient.publicKey,
            }),
        );

        const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
            skipPreflight: true,
            maxRetries: 0,
            preflightCommitment: 'confirmed',
        });
        expect(typeof signature).toBe('string');

        const statuses = await connection.getSignatureStatuses([signature]);
        expect(statuses.value[0]?.confirmationStatus).toBeTruthy();
    });

    it('simulates transactions and returns requested account data', async () => {
        const payer = Keypair.generate();
        const recipient = Keypair.generate();

        await ensureBalance(connection, payer);

        const { value: latestBlockhash } = await connection.getLatestBlockhash('confirmed');
        const transaction = new Transaction({
            feePayer: payer.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
        }).add(
            SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                lamports: 10_000,
                toPubkey: recipient.publicKey,
            }),
        );

        transaction.sign(payer);

        const simulation = await connection.simulateTransaction(transaction, {
            accounts: {
                addresses: [payer.publicKey.toBase58()],
                encoding: 'base64',
            },
            sigVerify: true,
        });

        expect(simulation.value.accounts).not.toBeNull();
        const [account] = simulation.value.accounts ?? [];
        if (account) {
            expect(account.data[1]).toBe('base64');
        }
    });

    it('returns program accounts with expected shapes', async () => {
        const accounts = await connection.getProgramAccounts(SystemProgram.programId, {
            commitment: 'processed',
            filters: [
                {
                    dataSize: 0,
                },
            ],
        });

        expect(Array.isArray(accounts)).toBe(true);
        if (accounts.length > 0) {
            const account = accounts[0];
            expect(account.pubkey).toBeInstanceOf(PublicKey);
            expect(typeof account.account.lamports).toBe('number');
            expect(account.account.owner).toBeInstanceOf(PublicKey);
            expect(account.account.data).toBeInstanceOf(Buffer);
        }
    });

    it('applies data slices to program accounts', async () => {
        const slice = { offset: 0, length: 0 } as const;
        const accounts = await connection.getProgramAccounts(SystemProgram.programId, {
            commitment: 'processed',
            dataSlice: slice,
        });

        expect(Array.isArray(accounts)).toBe(true);
        if (accounts.length > 0) {
            const account = accounts[0];
            expect(Buffer.isBuffer(account.account.data)).toBe(true);
            if (Buffer.isBuffer(account.account.data)) {
                expect(account.account.data.byteLength).toBe(slice.length);
            }
        }
    });
});


