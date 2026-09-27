// GPT-6 Astra, high reasoning effort. `decompress_root` added by Claude Opus 5.5
// (1M context), effort 40, on 2026-09-27, for a page whose variants share one
// repository.
import type {JSONType} from './json';

export interface CompressedJSON {
    export_form: 'compressed';
    version: 1;
    value_repository: unknown[];
    data: number;
}

enum NodeKind {
    SCALAR = 0,
    ARRAY = 1,
    OBJECT = 2,
}

function scalar(value: unknown): value is string | number | boolean | null {
    return value === null || typeof value === 'string' || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value));
}

function referenced_value(
    reference: unknown, values: JSONType[], limit: number = values.length,
): JSONType {
    if (typeof reference !== 'number' || !Number.isInteger(reference)
        || reference < 0 || reference >= limit) {
        throw new Error(`Invalid JSON reference ${String(reference)} for ${limit} values`);
    }
    return values[reference];
}

/* `record` decoded against `values`, which holds every record before `limit`
 * that `record` refers to. */
function decode_record(
    record: unknown, values: JSONType[], limit: number = values.length,
): JSONType {
    if (!Array.isArray(record) || record.length !== 2) {
        throw new Error('Invalid compressed JSON record');
    }
    const [kind, payload] = record;
    if (kind === NodeKind.SCALAR && scalar(payload)) {
        return payload;
    }
    if (!Array.isArray(payload)) {
        throw new Error('Invalid compressed JSON scalar or references');
    }
    if (kind === NodeKind.ARRAY) {
        return payload.map(reference => referenced_value(reference, values, limit));
    }
    if (kind === NodeKind.OBJECT && payload.length % 2 === 0) {
        const fields: [string, JSONType][] = [];
        const names = new Set<string>();
        for (let index = 0; index < payload.length; index += 2) {
            const name = referenced_value(payload[index], values, limit);
            if (typeof name !== 'string' || names.has(name)) {
                throw new Error(`Invalid or repeated JSON field name ${String(name)}`);
            }
            names.add(name);
            fields.push([name, referenced_value(payload[index + 1], values, limit)]);
        }
        return Object.fromEntries(fields);
    }
    throw new Error(`Invalid compressed JSON node kind or fields: ${String(kind)}`);
}

/** Shared decoded containers are read-only; term construction retains occurrence identity. */
export function decompress_json(document: unknown): JSONType {
    if (typeof document !== 'object' || document === null) {
        throw new Error('Invalid compressed JSON envelope');
    }
    const envelope = document as Partial<CompressedJSON>;
    if (envelope.export_form !== 'compressed' || envelope.version !== 1
        || !Array.isArray(envelope.value_repository)) {
        throw new Error('Invalid compressed JSON envelope or unsupported version');
    }
    const values: JSONType[] = [];
    for (const record of envelope.value_repository) {
        values.push(decode_record(record, values));
    }
    return referenced_value(envelope.data, values);
}

/*
 * The records of `repository` that `root` reaches, `root` included, in
 * ascending order. A record refers only to the records before it, so a record
 * decoded in this order finds every record it refers to already decoded.
 */
function records_reached_from(repository: readonly unknown[], root: number): number[] {
    const reached = new Set<number>([root]);
    const unvisited = [root];
    while (unvisited.length) {
        const record = repository[unvisited.pop() as number];
        const [kind, payload] = Array.isArray(record) ? record : [];
        if (kind === NodeKind.SCALAR || !Array.isArray(payload)) {
            continue;
        }
        payload.forEach((reference: unknown) => {
            if (typeof reference === 'number' && Number.isInteger(reference)
                && reference >= 0 && reference < repository.length
                && !reached.has(reference)) {
                reached.add(reference);
                unvisited.push(reference);
            }
        });
    }
    return [...reached].sort((one, other) => one - other);
}

/**
 * The value of the record `root` of `repository`, decoding only the records
 * `root` reaches.
 *
 * `decoded` holds the records an earlier call decoded, at their indices, and
 * receives the records this call decodes. Two values that share a record
 * therefore share its decoded container and decode it once. Callers treat the
 * containers as read-only, as they do those `decompress_json` returns. A
 * reference to the record itself or to a later one is rejected as it is there.
 */
export function decompress_root(
    repository: readonly unknown[],
    root: number,
    decoded: JSONType[],
): JSONType {
    if (!Number.isInteger(root) || root < 0 || root >= repository.length) {
        throw new Error(
            `Invalid JSON reference ${String(root)} for ${repository.length} values`);
    }
    records_reached_from(repository, root)
        .filter((index) => !(index in decoded))
        .forEach((index) => {
            decoded[index] = decode_record(repository[index], decoded, index);
        });
    return decoded[root];
}
