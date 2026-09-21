enum AllEqualsFallback {
    RAISE = 'RAISE',
}

export function zip<T extends unknown[][]>(...arrays: T): { [K in keyof T]: T[K][number] }[] {
    const minlength = Math.min(...arrays.map(arr => arr.length));
    return Array.from({ length: minlength }, (_, i) => arrays.map(arr => arr[i]) as any);
}

/*
 * Structural equality, standing in for what `!=` does on the Python side. Every
 * term there is a frozen dataclass, so comparing two of them compares their
 * fields, and tuples compare elementwise; `===` here compares references, which
 * is not the same test at all. Terms carrying no `uid` - reindexings among them
 * - are rebuilt fresh at every position they occupy in the JSON, so two that
 * are structurally identical are never the same object.
 *
 * Matches dataclass `__eq__` in requiring the same class, not merely the same
 * fields, so a `Rearrangement` never compares equal to some other morphism that
 * happens to carry a like-named field.
 */
export function deep_equals(x: unknown, y: unknown): boolean {
    if (x === y) {
        return true;
    }
    if (x instanceof Array || y instanceof Array) {
        return (
            x instanceof Array && y instanceof Array
            && x.length === y.length
            && x.every((xi, i) => deep_equals(xi, y[i]))
        );
    }
    if (
        x === null || typeof x !== 'object'
        || y === null || typeof y !== 'object'
        || x.constructor !== y.constructor
    ) {
        return false;
    }
    const keys = Object.keys(x);
    return (
        keys.length === Object.keys(y).length
        && keys.every((key) => deep_equals(
            (x as Record<string, unknown>)[key],
            (y as Record<string, unknown>)[key],
        ))
    );
}

export function iallequals<T>(
    xs: Iterable<T>,
    fallback: AllEqualsFallback | T = AllEqualsFallback.RAISE): T {
        const iterator = xs[Symbol.iterator]();
        const first = iterator.next();

        if (first.done) {
            if (fallback !== AllEqualsFallback.RAISE) {
                return fallback as T;
            }
            throw new Error("Empty iterable and no fallback provided.");
        }

        while (true) {
            const result = iterator.next();
            if (result.done) break;
            if (!deep_equals(result.value, first.value)) {
                if (fallback !== AllEqualsFallback.RAISE) {
                    return fallback as T;
                }
                console.log(xs);
                throw new Error("Not all elements are equal and no fallback provided.");
            }
        }

        return first.value;
    }

export function map_filter<T, U>(
    xs: Iterable<T>, 
    predicate: (x: T) => boolean,
    fn: (x: T, i?: number) => U): U[] {
    return Array.from(xs).filter(x => predicate(x)).map(fn);
}

export function map_defined<T, U>(
    xs: Iterable<T | undefined>,
    fn: (x: T) => U | undefined): U[] {
    return Array.from(xs).filter((x): x is T => x !== undefined).map(fn).filter((x): x is U => x !== undefined);
}

export function sum(xs: Iterable<number>): number {
    let total = 0;
    for (const x of xs) {
        total += x;
    }
    return total;
}

export function join<T>(separator: () => T, xs: T[]): T[];
export function join<T>(separator: (index: number) => T, xs: T[]): T[];

export function join<T>(
    separator: (() => T) | ((index: number) => T), xs: T[],
): T[] {
    if (xs.length === 0) {
        return [];
    }
    if (separator.length === 0) {
        const constant = separator as () => T;
        return [xs[0], ...xs.slice(1).flatMap((x) => [constant(), x])];
    } else if (separator.length === 1) {
        const indexed = separator as (index: number) => T;
        return [xs[0], ...xs.slice(1).flatMap((x, i) => [indexed(i), x])];
    }
    throw new Error('Separator function must take 0 or 1 arguments.');
}

export function all(xs: Iterable<boolean>): boolean {
    for (const x of xs) {
        if (!x) {
            return false;
        }
    }
    return true;
}

export function mask<T>(_mask: boolean[], xs: T[]) {
    return xs.filter((_, i) => _mask[i]);
}

export function conditional_swap<T>(a: T, b: T, condition?: boolean): [T, T] {
    if (condition) {
        return [b, a];
    } else {
        return [a, b];
    }
}

export function range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
}

export function product<T extends unknown[][]>(...arrays: T): { [K in keyof T]: T[K][number] }[] {
    if (arrays.length === 0) {
        return [[]] as { [K in keyof T]: T[K][number] }[];
    }
    const [A, ...BC] = arrays;
    const BxC = product(...BC);
    const result: { [K in keyof T]: T[K][number] }[] = [];
    for (const a of A) {
        for (const bc of BxC) {
            result.push([a, ...bc] as { [K in keyof T]: T[K][number] });
        }
    }
    return result;
}

export function deconcatenate(mapping: number[], dom_length: number): [number, number][] {
    return product(range(mapping.length), range(dom_length)).filter(
        ([L, R]) => mapping.every((muk, k) => (k < L) == (muk < R))
    ).slice(1);
}