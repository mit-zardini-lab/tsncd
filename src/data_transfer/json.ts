import * as fd from '../data_structure/Term';
import {decompress_json} from './json_compression';

// type JSONType = Record<string, JSONType> | JSONType[] | string | null | number | boolean;

export type JSONType = { [key: string]: JSONType } | JSONType[] | string | number | boolean | null;

function json_main(target: any): boolean {
    return (
        typeof target === 'string'
        || typeof target === 'number'
        || typeof target === 'boolean'
        || target === null
    );
}

function isEnum(target: any): target is {name: string; constructor: {name: string}} {
    return (
        target !== null
        && typeof target === 'object'
        && 'name' in target
        && typeof(target as Record<string,unknown>).constructor === 'function'
    )
}

function single_to_json(target: any): JSONType {
    if (json_main(target)) {
        return target;
    }
    if (isEnum(target)) {
        return {
            __registered__: 'enum',
            type: target.constructor.name,
            name: target.name,
        };
    }
    if ('__registered__' in target) {
        return target;
    }
    throw new Error(`Cannot convert object of type ${typeof target} to JSON.`);
}

interface JSONImportForm {
    uid_repository: Record<fd.IDType, Record<string, any>>;
    data: Record<string, any>;
}

/**
 * The number each `cat.Broadcasted` was given as it was built from JSON.
 *
 * A `Broadcasted` carries no uid, so nothing sent beside a term can name one of
 * them by identity. The importer counts them instead, in the order it enters
 * them, and information sent beside the term is keyed by that count.
 * `pyncd`'s `data_transfer/broadcast_occurrences.py` reproduces the same walk,
 * and `advanced_display/inspectionBoxes.ts` is what reads the number back.
 */
export const BROADCAST_OCCURRENCES = new WeakMap<fd.Term, number>();

export function broadcast_occurrence(term: fd.Term): number | undefined {
    return BROADCAST_OCCURRENCES.get(term);
}

const BROADCASTED_TYPE = 'Broadcasted';

export class TermJSONConverter {
    private broadcasts_built: number = 0;

    constructor(
        private uid_records: Record<fd.IDType, Record<string, any>>,
        private uid_terms: Map<fd.IDType, fd.Term> = new Map(),
    ) {}

    to_term(data: unknown): any {
        if (data instanceof Array) {
            return data.map(d => this.to_term(d));
        }
        if (json_main(data)) {
            return data;
        }
        if (typeof data !== 'object' || data === null) {
            throw new Error(
                `Cannot convert ${String(data)} to a Term. A term is an object, `
                + 'an array, or a JSON scalar.');
        }
        const data_record = data as Record<string, any>;
        if ('__ref__' in data_record) {
            const id = data_record['__ref__'] as fd.IDType;
            // `has`, not `in`: `uid_terms` is a Map, whose keys are not
            // properties of it. `uid_records` below is a plain record, so `in`
            // is right there - which is what made this easy to miss.
            if (this.uid_terms.has(id)) {
                return this.uid_terms.get(id);
            }
            if (id in this.uid_records) {
                const new_term = this.to_term(
                    this.uid_records[id] as Record<string, any>);
                this.uid_terms.set(id, new_term);
                return new_term;
            }
            throw new Error(`Reference ID not found in UID repository: ${id}`);
        }
        if ('__type__' in data_record) {
            if (!(data_record['__type__'] in fd.TermDirectory)) {
                throw new Error(`Term type not found in TermDirectory: ${data_record['__type__']}`);
            }
            // Read before the fields are converted, so a nested `Broadcasted`
            // takes a later number than the one holding it.
            const occurrence = data_record['__type__'] === BROADCASTED_TYPE
                ? this.broadcasts_built++ : undefined;
            const term = new fd.TermDirectory[data_record['__type__']](
                ...Object.entries(data_record)
                    .filter(([k, _]) => k !== '__type__')
                    .map(([_, v]) => this.to_term(v))
            );
            if (occurrence !== undefined) {
                BROADCAST_OCCURRENCES.set(term, occurrence);
            }
            return term;
        }
        if (data_record['__registered__'] === 'enum') {
            return (fd.EnumDirectory as Record<string, any>)
                [data_record['type']]
                [data_record['name']];
        }
        if (data_record['__registered__'] === 'type') {
            return data;
        }
        throw new Error(`Cannot convert JSON object to Term: ${JSON.stringify(data)}`);
    }

    /**
     * Rebuild a term from the envelope a `dataUpdate` carries.
     *
     * The envelope is checked before the walk, because a payload with no
     * `data` key otherwise reaches `to_term` as `undefined` and fails there
     * naming `__ref__`, which says nothing about what actually arrived.
     */
    static async import(exported: unknown): Promise<fd.Term> {
        const form = typeof exported === 'object' && exported !== null
            ? (exported as {export_form?: unknown}).export_form : undefined;
        if (form !== undefined && form !== 'compressed' && form !== 'uid_references') {
            throw new Error(`Unsupported term export form ${String(form)}`);
        }
        const jsondata = form === 'compressed' ? decompress_json(exported) : exported;
        if (typeof jsondata !== 'object' || jsondata === null
            || !('uid_repository' in jsondata) || !('data' in jsondata)) {
            throw new Error(
                'A term payload must be an object carrying `uid_repository` and '
                + `\`data\`. Received: ${JSON.stringify(jsondata)?.slice(0, 120)}`);
        }
        const term_converter = new TermJSONConverter(
            (jsondata as JSONImportForm).uid_repository
        )
        return term_converter.to_term(jsondata['data']);
    }
}