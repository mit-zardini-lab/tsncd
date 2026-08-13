import * as fd from '../data_structure/Term';
import output from '../json_files/transformer.json';
// import output from '../json_files/output.json';

// type JSONType = Record<string, JSONType> | JSONType[] | string | null | number | boolean;

type JSONType = { [key: string]: JSONType } | JSONType[] | string | number | boolean | null;

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

export class TermJSONConverter {
    constructor(
        private uid_records: Record<fd.IDType, Record<string, any>>,
        private uid_terms: Map<fd.IDType, fd.Term> = new Map(),
    ) {}

    to_term(data: JSONType): any {
        if (data instanceof Array) {
            return data.map(d => this.to_term(d));
        }
        if (json_main(data)) {
            return data;
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
            return new fd.TermDirectory[data_record['__type__']](
                ...Object.entries(data_record)
                    .filter(([k, _]) => k !== '__type__')
                    .map(([_, v]) => this.to_term(v))
            )
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

    static async import_from_file(filepath: string): Promise<any> {
        // const rawdata = await fetch(filepath);
        // const jsonparse = await output.json();
        const jsonparse = output as JSONImportForm;
        // console.log('jsonparse')
        // console.log(jsonparse['uid_repository']);
        // console.log(jsonparse['data']);
        const term_converter = new TermJSONConverter(
            jsonparse['uid_repository']
        );
        return term_converter.to_term(jsonparse['data']);   
    }

    static async import(jsondata: JSONImportForm): Promise<fd.Term> {
        const term_converter = new TermJSONConverter(
            jsondata['uid_repository']
        )
        return term_converter.to_term(jsondata['data']);
    }
}