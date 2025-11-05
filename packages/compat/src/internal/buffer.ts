export function toBuffer(data: Uint8Array): Buffer | Uint8Array {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(data);
    }
    return data;
}

