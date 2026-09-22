// GPT-6 Astra, high reasoning effort.
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

function referenced_value(reference: unknown, values: JSONType[]): JSONType {
    if (typeof reference !== 'number' || !Number.isInteger(reference)
        || reference < 0 || reference >= values.length) {
        throw new Error(`Invalid JSON reference ${String(reference)} for ${values.length} values`);
    }
    return values[reference];
}

function decode_record(record: unknown, values: JSONType[]): JSONType {
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
        return payload.map(reference => referenced_value(reference, values));
    }
    if (kind === NodeKind.OBJECT && payload.length % 2 === 0) {
        const fields: [string, JSONType][] = [];
        const names = new Set<string>();
        for (let index = 0; index < payload.length; index += 2) {
            const name = referenced_value(payload[index], values);
            if (typeof name !== 'string' || names.has(name)) {
                throw new Error(`Invalid or repeated JSON field name ${String(name)}`);
            }
            names.add(name);
            fields.push([name, referenced_value(payload[index + 1], values)]);
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
