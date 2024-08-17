export function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a == null || typeof a !== 'object' || b == null || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    keysA.sort();
    keysB.sort();

    for (let i = 0; i < keysA.length; i++) {
        const key = keysA[i];
        if (key !== keysB[i] || !deepEqual(a[key], b[key])) return false;
    }
    return true;
}