export function ensureNodeRequire() {
    if (typeof globalThis === 'undefined') {
        return;
    }
    if (typeof process === 'undefined' || !process.versions?.node) {
        return;
    }
    const globalObject = globalThis as { require?: NodeRequire };
    const localRequire: NodeRequire | undefined =
        typeof require === 'function'
            ? require
            : typeof globalObject.require === 'function'
              ? globalObject.require
              : undefined;
    if (typeof globalObject.require !== 'function' && localRequire) {
        globalObject.require = localRequire;
    }
}
