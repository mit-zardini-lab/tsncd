type Prod<T> = T[];
type Constructor<T> = new (...args: any[]) => T;
export const TermDirectory: Record<string, Constructor<Term>> = {};
export const EnumDirectory: Record<string, object> = {};

// export type GeneralTerm = Term | GeneralTerm[]

export function register_term<T extends Constructor<Term>>(cls: T): T {
    if (cls.name in TermDirectory) {
        throw new Error(`Class name ${cls.name} is already registered.`);
    }
    TermDirectory[cls.name] = cls;
    return cls;
}

interface EnumType {
    type: string,
}
export function register_enum(cls: EnumType): void {
    console.log(cls);
    const type_name = cls['type'];
    if (type_name in EnumDirectory) {
        throw new Error(`Enum name ${type_name} is already registered.`);
    }
    EnumDirectory[type_name] = cls;
    console.log(`Registered enum ${type_name}.`);
}

export abstract class Term {

    keys(): string[] {
        return Object.keys(this);
    }

    dict(): Record<string, any> {
        return Object.fromEntries(this.keys().map(k => [k, (this as any)[k]]))
    }

    items(): [string, any][] {
        return this.keys().map(k => [k, (this as any)[k]]);
    }
}

const IDMAX = 2**31 - 1; 
export type int = number;
export type IDType = int;
function fresh_id(): IDType {
    return Math.floor(Math.random() * IDMAX);
}

@register_term
export class DynamicNameSettings extends Term {
    constructor(
        readonly bold: boolean = false,
        readonly overline: boolean = false,
        readonly absolute: boolean = false,
    ) {
        super();
    }
}

@register_term
export class DynamicName extends Term {
    constructor(
        readonly body: null | string = null,
        readonly subscript: null | DynamicName = null,
        readonly settings: null | DynamicNameSettings = null,
    ) {
        super();
    }

    lineage(): DynamicName[] {
        if (this.body === null) {
            return [];
        }
        if (this.subscript === null) {
            return [this];
        }
        return [this, ...this.subscript.lineage()];
    }

    body_latex(): string {
        let body = this.body ?? '';
        if (this.settings?.overline) {
            body = `\\overline{${body}}`;
        }
        if (this.settings?.bold) {
            body = `\\bold{${body}}`;
        }
        return body
    }

    to_latex(): string {
        const latex = this.body_latex() + (
            this.subscript ? 
            `_{${this.subscript.lineage().map(
                (x) => x.body_latex()).join(' ')}}`
            : ''
        );
        if (this.settings?.absolute) {
            return `|${latex}|`;
        }
        return latex;
    }

    add_subscript(name: string | DynamicName): DynamicName {
        const new_subscript = typeof name === 'string' ? new DynamicName(name) : name;
        if (this.subscript === null) {
            return new DynamicName(this.body, new_subscript, this.settings);
        }
        return new DynamicName(this.body, this.subscript.add_subscript(new_subscript), this.settings);
    }
}

interface TypeForm {
    '__registered__': 'type',
    'repr': string
}

@register_term
export class UID<T extends Term=Term> extends Term {
    constructor(
        readonly _type: TypeForm,
        readonly _id: IDType = fresh_id(),
        readonly _name: null | DynamicName = null,
    ) {
        super();
    }
    static template<U extends Term>(type: string): UID<U> {
        return new UID<U>({ '__registered__': 'type', 'repr': type });
    }
}

export abstract class UTerm extends Term {
    constructor(
        readonly uid: UID,
    ) {
        super();
    }
}