import { address } from '@solana/addresses';
import { AccountRole } from '@solana/instructions';
import { createSignableMessage } from '@solana/signers';
import nacl from 'tweetnacl';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';

import { toAddress, toKitSigner, toPublicKey, toWeb3Instruction, fromWeb3Instruction } from '../bridges';

describe('bridges', () => {
    it('converts PublicKey to Address and back', () => {
        const keypair = Keypair.generate();
        const addr = toAddress(keypair.publicKey);
        expect(typeof addr).toBe('string');
        expect(toPublicKey(addr).equals(keypair.publicKey)).toBe(true);
    });

    it('converts kit instructions to web3 instructions and back', () => {
        const programId = Keypair.generate().publicKey;
        const account = Keypair.generate().publicKey;
        const kitInstruction = Object.freeze({
            accounts: [
                Object.freeze({
                    address: toAddress(account),
                    role: AccountRole.WRITABLE_SIGNER,
                }),
            ],
            data: new Uint8Array([1, 2, 3]),
            programAddress: toAddress(programId),
        });

        const legacyInstruction = toWeb3Instruction(kitInstruction);
        expect(legacyInstruction).toBeInstanceOf(TransactionInstruction);

        const roundTripped = fromWeb3Instruction(legacyInstruction);
        expect(roundTripped).toStrictEqual(kitInstruction);
    });

    it('creates kit-compatible signers from web3 keypairs', async () => {
        expect.assertions(3);
        const naclKeypair = nacl.sign.keyPair();
        const web3Keypair = Keypair.fromSecretKey(naclKeypair.secretKey);

        const kitSigner = await toKitSigner(web3Keypair, { extractable: true });
        expect(kitSigner.address).toBe(address(web3Keypair.publicKey.toBase58()));

        const message = createSignableMessage(new Uint8Array([11, 22, 33]));
        const [signatureDictionary] = await kitSigner.signMessages([message]);
        const kitSignature = signatureDictionary[kitSigner.address];
        expect(kitSignature).toBeDefined();

        const naclSignature = nacl.sign.detached(message.content, naclKeypair.secretKey);
        expect(kitSignature).toStrictEqual(naclSignature);
    });
});


