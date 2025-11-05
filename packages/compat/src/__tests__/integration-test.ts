import { createSolanaRpc } from '@solana/rpc';
import { address } from '@solana/addresses';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { lamports } from '@solana/rpc-types';

import { Connection, LAMPORTS_PER_SOL, SystemProgram, sendAndConfirmTransaction } from '..';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899';

describe('compat integration', () => {
    jest.setTimeout(120_000);

    let connection: Connection;
    beforeEach(() => {
        connection = new Connection(RPC_URL, 'confirmed');
    });

    it('sends and confirms transactions', async () => {
        expect.assertions(2);

        const payer = Keypair.generate();
        const recipient = Keypair.generate();

        const rpc = createSolanaRpc(RPC_URL);
        const airdropSignature = await rpc
            .requestAirdrop(
                address(payer.publicKey.toBase58()),
                lamports(BigInt(2) * BigInt(LAMPORTS_PER_SOL)),
            )
            .send();
        await connection.confirmTransaction(airdropSignature, 'confirmed');

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
});


