import * as rh from '../Render/RenderHandler';
import * as cat from '../../data_structure/Category';
import * as fd from '../../data_structure/Term';
import {Separated} from '../../utilities/Separated';
import * as cr from './CategoryRenderer';
import * as crs from './CategoryRendererSettings';
import * as ut from '../../utilities/utilities';
import * as pt from '../../utilities/Point';
import * as nm from '../../data_structure/Numeric';

export function numeric_string(target: nm.Numeric): string | undefined {
    let name: string | undefined = undefined;
    if (target instanceof nm.Integer) {
        name = target._value.toString();
    } else if (target instanceof nm.FreeNumeric) {
        name = target.uid._name?.to_latex() || '';
    } else if (target instanceof nm.Associative) {
        name = associative_string(target);
    } else if (target instanceof nm.Power) {
        name = power_string(target);
    } else if (target instanceof nm.Logarithm) {
        name = logarithm_string(target);
    }
    return name;
}

function associative_string(target: nm.Associative): string | undefined {
    const parts: string[] = [];
    for (const term of target.content) {
        const part = numeric_string(term);
        if (part === undefined) {
            return undefined;
        }
        parts.push(part);
    }
    return `(${parts.join(` ${target.sep} `)})`;
}

function power_string(target: nm.Power): string | undefined {
    const base = numeric_string(target.base);
    const exponent = numeric_string(target.exponent);
    if (base === undefined || exponent === undefined) {
        return undefined;
    }
    return `${base}^{${exponent}}`;
}

function logarithm_string(target: nm.Logarithm): string | undefined {
    const base = numeric_string(target.base);
    const argument = numeric_string(target.argument);
    if (base === undefined || argument === undefined) {
        return undefined;
    }
    return `log_{${base}}(${argument})`;
}
