import { createSolanaRpc, type SolanaRpcApi } from '@solana/rpc';
import type { Rpc } from '@solana/rpc-spec';
import type { Base64EncodedDataResponse, Commitment, DataSlice } from '@solana/rpc-types';
import { getBase64Decoder, getBase64Encoder } from '@solana/codecs-strings';
import {
    type AccountInfo,
    Commitment as Web3Commitment,
    type ConnectionConfig,
    PublicKey,
    type SendOptions,
    type SignatureStatus,
    type SignatureStatusConfig,
    type SimulatedTransactionAccountInfo,
    type SimulatedTransactionResponse,
    type SimulateTransactionConfig,
    Transaction,
    type TransactionSignature,
    VersionedTransaction,
} from '@solana/web3.js';
import type { Signature } from '@solana/keys';
import bs58 from 'bs58';
import type { Base64EncodedWireTransaction } from '@solana/transactions';

import { toAddress, toPublicKey } from './bridges';
import { toBuffer } from './internal/buffer';

type NormalizedCommitment = 'processed' | 'confirmed' | 'finalized';

const COMMITMENT_ALIAS: Record<string, NormalizedCommitment> = {
    recent: 'confirmed',
    single: 'processed',
    singleGossip: 'processed',
    root: 'finalized',
    max: 'finalized',
};

const COMMITMENT_PRIORITY: Record<NormalizedCommitment, number> = {
    processed: 0,
    confirmed: 1,
    finalized: 2,
};

type ConnectionCommitmentInput = Web3Commitment | (ConnectionConfig & { commitment?: Web3Commitment }) | undefined;

type RpcContext = Readonly<{ apiVersion?: string; slot: number }>;

type RpcAccountInfo = Readonly<{
    data: Base64EncodedDataResponse | Uint8Array;
    executable: boolean;
    lamports: bigint | number;
    owner: string;
    rentEpoch: bigint | number | null | undefined;
}>;

type RpcProgramAccount = Readonly<{ account: RpcAccountInfo; pubkey: string }>;

type RpcSignatureStatus =
    | Readonly<{
          slot: bigint | number;
          confirmations: bigint | number | null;
          err: unknown;
          confirmationStatus?: string | null;
      }>
    | null;

type AccountInfoConfig = Readonly<{
    commitment?: Commitment;
    dataSlice?: DataSlice;
    minContextSlot?: number;
}>;

type ProgramAccountsConfig = Readonly<{
    commitment?: Commitment;
    dataSlice?: DataSlice;
    encoding?: 'base64' | 'base64+zstd';
    filters?: ReadonlyArray<unknown>;
    minContextSlot?: number;
    withContext?: boolean;
}>;

type RpcResponseWithContext<T> = Readonly<{ context: RpcContext; value: T }>;

function normalizeCommitment(commitment?: Commitment | string | null): NormalizedCommitment | undefined {
    if (!commitment) {
        return undefined;
    }
    if (commitment in COMMITMENT_ALIAS) {
        return COMMITMENT_ALIAS[commitment as keyof typeof COMMITMENT_ALIAS];
    }
    return commitment as NormalizedCommitment;
}

function resolveCommitment(input?: ConnectionCommitmentInput): NormalizedCommitment | undefined {
    if (typeof input === 'string') {
        return normalizeCommitment(input);
    }
    return normalizeCommitment(input?.commitment);
}

function toNumber(value: bigint | number): number {
    return typeof value === 'number' ? value : Number(value);
}

function toNullableNumber(value: bigint | number | null | undefined): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    return typeof value === 'number' ? value : Number(value);
}

const base64Encoder = getBase64Encoder();
const base64Decoder = getBase64Decoder();

function decodeAccountData(data: Base64EncodedDataResponse | Uint8Array): Uint8Array {
    if (data instanceof Uint8Array) {
        return data;
    }
    const [encoded, encoding] = data;
    switch (encoding as string) {
        case 'base58':
            return bs58.decode(encoded);
        case 'base64+zstd':
        case 'base64':
        default:
            const decoded = base64Encoder.encode(encoded);
            return decoded instanceof Uint8Array ? decoded : Uint8Array.from(decoded);
    }
}

function mapAccountInfo(raw: RpcAccountInfo): AccountInfo<Buffer | object> {
    const accountData = decodeAccountData(raw.data);
    return {
        data: toBuffer(accountData) as Buffer,
        executable: raw.executable,
        lamports: toNumber(raw.lamports),
        owner: toPublicKey(raw.owner),
        rentEpoch: toNullableNumber(raw.rentEpoch ?? null) ?? undefined,
    } satisfies AccountInfo<Buffer>;
}

function mapSimulatedAccountInfo(raw: RpcAccountInfo): SimulatedTransactionAccountInfo {
    const bytes = decodeAccountData(raw.data);
    return {
        data: [base64Decoder.decode(bytes), 'base64'],
        executable: raw.executable,
        lamports: toNumber(raw.lamports),
        owner: raw.owner,
        rentEpoch: toNullableNumber(raw.rentEpoch ?? null) ?? undefined,
    } satisfies SimulatedTransactionAccountInfo;
}

function mapSignatureStatus(result: RpcSignatureStatus): SignatureStatus | null {
    if (!result) {
        return null;
    }
    return {
        slot: toNumber(result.slot),
        confirmations: toNullableNumber(result.confirmations),
        err: (result.err ?? null) as SignatureStatus['err'],
        confirmationStatus: normalizeCommitment(result.confirmationStatus ?? undefined),
    } satisfies SignatureStatus;
}

function serializeTransactionBytes(input: VersionedTransaction | Transaction | Uint8Array | number[]): Uint8Array {
    if (input instanceof VersionedTransaction) {
        return input.serialize();
    }
    if (input instanceof Transaction) {
        return input.serialize();
    }
    if (input instanceof Uint8Array) {
        return input;
    }
    return Uint8Array.from(input);
}

function convertMinContextSlot(value: number | undefined): bigint | undefined {
    if (value === undefined) {
        return undefined;
    }
    return BigInt(value);
}

function toRpcAccountInfo(value: unknown): RpcAccountInfo | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const candidate = value as Partial<RpcAccountInfo>;
    if (!('data' in candidate) || !('lamports' in candidate) || !('owner' in candidate)) {
        return null;
    }
    return {
        data: candidate.data as Base64EncodedDataResponse | Uint8Array,
        executable: Boolean((candidate as { executable?: boolean }).executable),
        lamports: (candidate as { lamports: bigint | number }).lamports,
        owner: String((candidate as { owner: string }).owner),
        rentEpoch: (candidate as { rentEpoch?: bigint | number | null | undefined }).rentEpoch ?? null,
    };
}

function toBase64WireTransaction(bytes: Uint8Array): Base64EncodedWireTransaction {
    return base64Decoder.decode(bytes) as unknown as Base64EncodedWireTransaction;
}

function convertSendOptions(options?: SendOptions): Omit<Parameters<SolanaRpcApi['sendTransaction']>[1], 'encoding'> | undefined {
    if (!options) {
        return undefined;
    }
    const { maxRetries, minContextSlot, preflightCommitment, ...rest } = options;
    return {
        ...rest,
        ...(preflightCommitment ? { preflightCommitment: normalizeCommitment(preflightCommitment) } : undefined),
        ...(maxRetries !== undefined ? { maxRetries: BigInt(maxRetries) } : undefined),
        ...(minContextSlot !== undefined ? { minContextSlot: BigInt(minContextSlot) } : undefined),
    } as unknown as Omit<Parameters<SolanaRpcApi['sendTransaction']>[1], 'encoding'>;
}

function convertSimulateConfig(
    config: SimulateTransactionConfig | undefined,
    fallbackCommitment?: NormalizedCommitment,
): Parameters<SolanaRpcApi['simulateTransaction']>[1] {
    const result: Record<string, unknown> = {
        encoding: 'base64',
        sigVerify: config?.sigVerify ?? false,
    };
    const normalizedCommitment = normalizeCommitment(config?.commitment) ?? fallbackCommitment;
    if (config?.replaceRecentBlockhash !== undefined) {
        result.replaceRecentBlockhash = config.replaceRecentBlockhash;
    }
    if (normalizedCommitment) {
        result.commitment = normalizedCommitment;
    }
    if (config?.minContextSlot !== undefined) {
        result.minContextSlot = BigInt(config.minContextSlot);
    }
    if (config?.accounts) {
        result.accounts = {
            ...config.accounts,
            encoding: (config.accounts.encoding ?? 'base64') as 'base64' | 'jsonParsed',
            addresses: config.accounts.addresses?.map(addr => (typeof addr === 'string' ? addr : toAddress(addr))),
        };
    }
    if (config?.innerInstructions !== undefined) {
        result.innerInstructions = config.innerInstructions;
    }

    return result as unknown as Parameters<SolanaRpcApi['simulateTransaction']>[1];
}

async function wait(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

function mapRpcContext(context: unknown): RpcContext {
    const slotLike = (context as { slot?: number | bigint | string }).slot;
    const apiVersion = (context as { apiVersion?: string | null }).apiVersion;
    const slotValue = slotLike === undefined ? 0 : typeof slotLike === 'string' ? Number(slotLike) : slotLike;
    return {
        apiVersion: typeof apiVersion === 'string' ? apiVersion : undefined,
        slot: toNumber(slotValue as number | bigint),
    };
}

export class Connection {
    readonly commitment?: NormalizedCommitment;
    readonly rpcEndpoint: string;
    private readonly rpc: Rpc<SolanaRpcApi>;

    constructor(endpoint: string, commitmentOrConfig?: ConnectionCommitmentInput) {
        this.rpcEndpoint = endpoint;
        this.commitment = resolveCommitment(commitmentOrConfig);
        this.rpc = createSolanaRpc(endpoint);
    }

    async getLatestBlockhash(commitment?: Commitment): Promise<RpcResponseWithContext<{ blockhash: string; lastValidBlockHeight: number }>> {
        const resolvedCommitment = normalizeCommitment(commitment) ?? this.commitment;
        const response = await this.rpc
            .getLatestBlockhash(resolvedCommitment ? { commitment: resolvedCommitment } : undefined)
            .send();
        return {
            context: mapRpcContext(response.context),
            value: {
                blockhash: response.value.blockhash,
                lastValidBlockHeight: Number(response.value.lastValidBlockHeight),
            },
        };
    }

    async getBalance(publicKey: PublicKey | string, commitment?: Commitment): Promise<number> {
        const resolvedCommitment = normalizeCommitment(commitment) ?? this.commitment;
        const response = await this.rpc
            .getBalance(toAddress(publicKey), resolvedCommitment ? { commitment: resolvedCommitment } : undefined)
            .send();
        return Number(response.value);
    }

    async getAccountInfo<TAccountData = Buffer | object>(
        publicKey: PublicKey | string,
        commitmentOrConfig?: Commitment | AccountInfoConfig,
    ): Promise<AccountInfo<TAccountData> | null> {
        const config = typeof commitmentOrConfig === 'object' && commitmentOrConfig !== null ? commitmentOrConfig : undefined;
        const commitment = normalizeCommitment(
            typeof commitmentOrConfig === 'string' ? commitmentOrConfig : commitmentOrConfig?.commitment,
        ) ?? this.commitment;
        const rpcConfig = {
            ...(config?.dataSlice ? { dataSlice: config.dataSlice } : undefined),
            ...(config?.minContextSlot !== undefined ? { minContextSlot: convertMinContextSlot(config.minContextSlot) } : undefined),
            encoding: 'base64' as const,
            ...(commitment ? { commitment } : undefined),
        } as Parameters<SolanaRpcApi['getAccountInfo']>[1];
        const response = await this.rpc.getAccountInfo(toAddress(publicKey), rpcConfig).send();

        if (!response.value) {
            return null;
        }

        const accountInfo = toRpcAccountInfo(response.value);
        return accountInfo ? (mapAccountInfo(accountInfo) as AccountInfo<TAccountData>) : null;
    }

    async getProgramAccounts(
        programId: PublicKey | string,
        commitmentOrConfig?: Commitment | ProgramAccountsConfig,
    ): Promise<Array<{ pubkey: PublicKey; account: AccountInfo<Buffer | object> }>> {
        const config = typeof commitmentOrConfig === 'object' && commitmentOrConfig !== null ? commitmentOrConfig : undefined;
        const commitment = normalizeCommitment(
            typeof commitmentOrConfig === 'string' ? commitmentOrConfig : commitmentOrConfig?.commitment,
        ) ?? this.commitment;
        const rpcConfig = {
            ...(config?.dataSlice ? { dataSlice: config.dataSlice } : undefined),
            ...(config?.filters ? { filters: config.filters } : undefined),
            ...(config?.minContextSlot !== undefined ? { minContextSlot: convertMinContextSlot(config.minContextSlot) } : undefined),
            ...(config?.withContext !== undefined ? { withContext: config.withContext } : undefined),
            encoding: config?.encoding ?? 'base64',
            ...(commitment ? { commitment } : undefined),
        } as Parameters<SolanaRpcApi['getProgramAccounts']>[1];
        const response = await this.rpc.getProgramAccounts(toAddress(programId), rpcConfig).send();

        const accounts = (response ?? []) as unknown as readonly RpcProgramAccount[];

        return accounts
            .map(programAccount => {
                const rpcAccount = toRpcAccountInfo(programAccount.account);
                if (!rpcAccount) {
                    return null;
                }
                return {
                    account: mapAccountInfo(rpcAccount),
                    pubkey: toPublicKey(programAccount.pubkey),
                };
            })
            .filter((entry): entry is { pubkey: PublicKey; account: AccountInfo<Buffer | object> } => entry !== null);
    }

    async getSignatureStatuses(
        signatures: readonly TransactionSignature[],
        config?: SignatureStatusConfig,
    ): Promise<RpcResponseWithContext<(SignatureStatus | null)[]>> {
        const response = await this.rpc
            .getSignatureStatuses(signatures as readonly Signature[], config)
            .send();
        return {
            context: mapRpcContext(response.context),
            value: (response.value as unknown as readonly RpcSignatureStatus[]).map(mapSignatureStatus),
        };
    }

    async sendRawTransaction(rawTransaction: Uint8Array | number[] | Transaction | VersionedTransaction, options?: SendOptions): Promise<string> {
        const bytes = serializeTransactionBytes(rawTransaction);
        const payload = toBase64WireTransaction(bytes);
        const overrides = convertSendOptions(options);
        const config = {
            encoding: 'base64' as const,
            ...(overrides ?? {}),
        } as Parameters<SolanaRpcApi['sendTransaction']>[1];
        return await this.rpc.sendTransaction(payload as Base64EncodedWireTransaction, config).send();
    }

    async confirmTransaction(signature: TransactionSignature, commitment?: Commitment) {
        const normalizedCommitment = normalizeCommitment(commitment) ?? this.commitment ?? 'finalized';
        const start = Date.now();
        const timeoutMs = 60_000;
        let lastContext: RpcContext | undefined;
        let lastStatus: SignatureStatus | null = null;

        while (Date.now() - start < timeoutMs) {
            const statuses = await this.getSignatureStatuses([signature], {
                searchTransactionHistory: true,
            });
            lastContext = statuses.context;
            lastStatus = statuses.value[0];
            if (!lastStatus) {
                await wait(500);
                continue;
            }
            if (lastStatus.err) {
                break;
            }
            const statusCommitment = lastStatus.confirmationStatus
                ? normalizeCommitment(lastStatus.confirmationStatus)
                : undefined;
            if (statusCommitment) {
                if (COMMITMENT_PRIORITY[statusCommitment] >= COMMITMENT_PRIORITY[normalizedCommitment]) {
                    break;
                }
            } else {
                if (normalizedCommitment === 'processed') {
                    break;
                }
                if (normalizedCommitment === 'confirmed' && (lastStatus.confirmations ?? 0) > 0) {
                    break;
                }
                if (normalizedCommitment === 'finalized' && lastStatus.confirmations === null) {
                    break;
                }
            }
            await wait(500);
        }

        return {
            context: lastContext ?? { apiVersion: undefined, slot: 0 },
            value: lastStatus,
        };
    }

    async simulateTransaction(
        transaction: VersionedTransaction | Transaction | Uint8Array | number[],
        config?: SimulateTransactionConfig,
    ): Promise<RpcResponseWithContext<SimulatedTransactionResponse>> {
        const bytes = serializeTransactionBytes(transaction);
        const encoded = toBase64WireTransaction(bytes);
        const rpcConfig = convertSimulateConfig(config, this.commitment);
        const response = await this.rpc.simulateTransaction(encoded, rpcConfig).send();

        const responseValue = response.value as unknown as {
            accounts?: readonly unknown[] | null;
            err: SimulatedTransactionResponse['err'];
            logs?: SimulatedTransactionResponse['logs'] | undefined;
            returnData?: SimulatedTransactionResponse['returnData'] | undefined;
            unitsConsumed?: number | bigint | null | undefined;
        };

        const mapped: SimulatedTransactionResponse = {
            accounts:
                responseValue.accounts?.map(account => {
                    const rpcAccount = toRpcAccountInfo(account);
                    return rpcAccount ? mapSimulatedAccountInfo(rpcAccount) : null;
                }) ?? null,
            err: responseValue.err,
            logs: responseValue.logs ?? null,
            returnData: responseValue.returnData ?? null,
            unitsConsumed: toNullableNumber(responseValue.unitsConsumed ?? null) ?? undefined,
        };

        return {
            context: mapRpcContext(response.context),
            value: mapped,
        };
    }
}

