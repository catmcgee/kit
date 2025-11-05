import './register-require.js';

import { address } from '@solana/addresses';
import { lamports } from '@solana/rpc-types';
import { createSolanaRpc } from '@solana/rpc';
import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
} from '@solana/compat';
import { createLogger } from '@solana/example-utils/createLogger.js';

const logger = createLogger('compat-send-transaction');
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899';

async function ensureBalance(connection: Connection, keypair: Keypair) {
    const rpc = createSolanaRpc(RPC_URL);
    logger.info('Requesting airdrop');
    const signature = await rpc
        .requestAirdrop(address(keypair.publicKey.toBase58()), lamports(2n * BigInt(LAMPORTS_PER_SOL)))
        .send();
    await connection.confirmTransaction(signature, 'confirmed');
    const targetBalance = LAMPORTS_PER_SOL * 2;
    const start = Date.now();
    while (Date.now() - start < 60_000) {
        const balance = await connection.getBalance(keypair.publicKey, 'confirmed');
        if (balance >= targetBalance) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Timed out waiting for airdrop balance');
}

async function main() {
    const connection = new Connection(RPC_URL, 'confirmed');
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
            lamports: 1_000_000,
            toPubkey: recipient.publicKey,
        }),
    );

    logger.info('Sending transaction');
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

    logger.info(`Signature: ${signature}`);
    const transferTarget = 1_000_000;
    const transferStart = Date.now();
    let recipientBalance = 0;
    while (Date.now() - transferStart < 60_000) {
        recipientBalance = await connection.getBalance(recipient.publicKey, 'confirmed');
        if (recipientBalance >= transferTarget) {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    logger.info(`Recipient balance: ${recipientBalance} lamports`);
}

main().catch(err => {
    logger.error(err);
    process.exit(1);
});
