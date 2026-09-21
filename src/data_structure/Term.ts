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

/*
 * Where the exponent of a name is drawn, mirroring `ExponentPlacement` in
 * `pyncd`'s `data_structure/Term.py`. `SUPERSCRIPT` raises the exponent after
 * the name, `m^{5120}`. `SUBSCRIPT` lowers it into the subscript, `m_{5120}`,
 * after a colon where the name already has a subscript, `q_{Td:512}`, and
 * outside the absolute bars where the settings draw them, `|k|_{6}`.
 *
 * A JSON export made before `pyncd` gained the field carries four settings
 * fields, so the constructor default below stands for it.
 */
export enum ExponentPlacement {
    type = 'ExponentPlacement',
    SUPERSCRIPT = 'SUPERSCRIPT',
    SUBSCRIPT = 'SUBSCRIPT',
}
register_enum(ExponentPlacement);

@register_term
export class DynamicNameSettings extends Term {
    constructor(
        readonly bold: boolean = false,
        readonly overline: boolean = false,
        readonly absolute: boolean = false,
        readonly typewriter: boolean = false,
        readonly exponent_placement: ExponentPlacement
            = ExponentPlacement.SUPERSCRIPT,
    ) {
        super();
    }
}

/*
 * Mirrors `data_structure/Term.py`. The fields arrive positionally from the
 * JSON, so they stand in the order Python declares them. `code_form` is the
 * identifier the name stands for in generated code and is not drawn.
 * `exponent` is a name drawn after the subscript, which `pyncd` uses for the
 * assigned size of a tiling, `q_{Td}^{512}`. The settings decide whether it is
 * raised after the name or lowered into the subscript, where the same tiling
 * reads `q_{Td:512}`.
 */
@register_term
export class DynamicName extends Term {
    constructor(
        readonly body: null | string = null,
        readonly subscript: null | DynamicName = null,
        readonly settings: null | DynamicNameSettings = null,
        readonly code_form: null | string = null,
        readonly exponent: null | DynamicName = null,
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
        if (this.settings?.typewriter) {
            body = `\\texttt{${body.replace(/_/g, '\\_')}}`;
        }
        if (this.settings?.overline) {
            body = `\\overline{${body}}`;
        }
        if (this.settings?.bold) {
            body = `\\bold{${body}}`;
        }
        return body
    }

    /* Where this name's exponent is drawn. A name carrying no settings raises
     * it, which is the placement every figure used before `pyncd` gained the
     * field. */
    exponent_placement(): ExponentPlacement {
        if (this.settings === null) {
            return ExponentPlacement.SUPERSCRIPT;
        }
        return this.settings.exponent_placement;
    }

    /* The bodies of the subscript and of everything below it, run together as
     * one script. */
    subscript_group_latex(): string {
        return (this.subscript?.lineage() ?? [])
            .map((x) => x.body_latex()).join(' ');
    }

    /* The bodies of the exponent and of everything below it, run together as
     * one script. */
    exponent_group_latex(): string {
        return (this.exponent?.lineage() ?? [])
            .map((x) => x.body_latex()).join(' ');
    }

    /* The exponent as its own script, raised or lowered by the placement the
     * settings declare. Empty where the name carries no exponent. */
    exponent_latex(): string {
        const group = this.exponent_group_latex();
        if (group === '') {
            return '';
        }
        const script = this.exponent_placement() === ExponentPlacement.SUBSCRIPT
            ? '_' : '^';
        return `${script}{${group}}`;
    }

    /*
     * The name as latex, mirroring `DynamicName.to_latex` in `pyncd`.
     *
     * A lowered exponent shares the subscript with the name's own subscript,
     * joined after a colon, so a tiling assigned 512 reads `q_{Td:512}`. Where
     * the settings draw absolute bars the two scripts cannot be joined, since
     * the subscript sits inside the bars and the exponent measures what the
     * bars enclose, so the exponent stands after them and a size symbol
     * assigned 6 reads `|k|_{6}` lowered and `|k|^{6}` raised.
     * `pyncd/obsidian/08-backends/Compound Axis Labels.md` states the rule for
     * every label holding more than one symbol.
     */
    to_latex(): string {
        const subscript = this.subscript_group_latex();
        const exponent = this.exponent_group_latex();
        const absolute = this.settings?.absolute ?? false;
        const lowered = this.exponent_placement() === ExponentPlacement.SUBSCRIPT;
        if (subscript !== '' && exponent !== '' && lowered && !absolute) {
            return `${this.body_latex()}_{${subscript}:${exponent}}`;
        }
        const name = this.body_latex() + (
            subscript !== '' ? `_{${subscript}}` : '');
        const measured = absolute ? `|${name}|` : name;
        return measured + this.exponent_latex();
    }

    add_subscript(name: string | DynamicName): DynamicName {
        const new_subscript = typeof name === 'string' ? new DynamicName(name) : name;
        if (this.subscript === null) {
            return new DynamicName(
                this.body, new_subscript, this.settings, this.code_form, this.exponent);
        }
        return new DynamicName(
            this.body, this.subscript.add_subscript(new_subscript), this.settings,
            this.code_form, this.exponent);
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