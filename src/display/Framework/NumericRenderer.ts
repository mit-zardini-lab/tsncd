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
    } else if (target instanceof nm.FreeInput || target instanceof nm.Constant) {
        name = target.to_latex();
    } else if (target instanceof nm.Associative) {
        name = associative_string(target);
    } else if (target instanceof nm.Power) {
        name = power_string(target);
    } else if (target instanceof nm.Logarithm) {
        name = logarithm_string(target);
    } else if (target instanceof nm.CumulativeGaussian) {
        name = cumulative_gaussian_string(target);
    } else if (target instanceof nm.Sigmoid) {
        name = sigmoid_string(target);
    } else if (target instanceof nm.IsPositive) {
        name = is_positive_string(target);
    } else if (target instanceof nm.RectifiedLinear) {
        name = rectified_linear_string(target);
    } else if (target instanceof nm.Clamp) {
        name = clamp_string(target);
    } else if (target instanceof nm.Sign) {
        name = sign_string(target);
    } else if (target instanceof nm.AbsoluteValue) {
        name = absolute_value_string(target);
    } else if (target instanceof nm.LargerOf) {
        name = larger_of_string(target);
    } else if (target instanceof nm.SquareRoot) {
        name = square_root_string(target);
    }
    return name;
}

function associative_string(target: nm.Associative): string | undefined {
    if (target instanceof nm.Addition) {
        return sum_string(target);
    }
    if (target instanceof nm.Multiplication) {
        return product_string(target);
    }
    return undefined;
}

/*
 * A sum, with every negated term written as a subtraction after the terms that
 * are added. `nm.Addition` holds a negation as the product `-1 * x` and
 * `template` sorts its operands into `canonical_order`, which puts an integer
 * first, so the terms arrive in an order that writes `-2 + 2|a|`. Separating
 * the two groups writes the same sum `2|a| - 2`, and a sum of negations alone
 * writes `-x - y`.
 *
 * `nm.is_negative` says which group a term joins, and the term is written
 * without its sign in either group, so `a + -2 b` reads `a - 2 b`.
 *
 * A negated term that is itself a sum is bracketed, since `- (x + y)` negates
 * both of its terms and `- x + y` negates one. `nm.signed_latex` brackets the
 * same case.
 */
function sum_string(target: nm.Addition): string | undefined {
    const added: string[] = [];
    const subtracted: string[] = [];
    for (const term of target.content) {
        const part = juxtaposed_string(nm.without_sign(term));
        if (part === undefined) {
            return undefined;
        }
        (nm.is_negative(term) ? subtracted : added).push(part);
    }
    if (added.length === 0) {
        return subtracted.map(
            (part, i) => i === 0 ? `-${part}` : `- ${part}`).join(' ');
    }
    return [added.join(' + '),
            ...subtracted.map((part) => `- ${part}`)].join(' ');
}

/*
 * A product, written by juxtaposition as mathematics writes one. A negative
 * product carries one minus sign, in front, so `-2 * -x` reads `2 x` and never
 * `-2 -x`. `nm.Multiplication.to_latex` and `pyncd` write the same product.
 */
function product_string(target: nm.Multiplication): string | undefined {
    const unsigned = juxtaposed_string(nm.without_sign(target));
    if (unsigned === undefined) {
        return undefined;
    }
    return nm.is_negative(target) ? `-${unsigned}` : unsigned;
}

/*
 * The factors of `unsigned` side by side, where `unsigned` holds no negative
 * factor.
 *
 * A factor that is a sum is bracketed, because juxtaposition binds tighter
 * than addition and `(x + y) z` written without the brackets reads as
 * `x + y z`. `nm.product_part_latex` brackets the same case.
 */
function juxtaposed_string(unsigned: nm.Numeric): string | undefined {
    const factors = unsigned instanceof nm.Multiplication
        ? unsigned.content : [unsigned];
    const parts: string[] = [];
    for (const factor of factors) {
        const part = numeric_string(factor);
        if (part === undefined) {
            return undefined;
        }
        parts.push(factor instanceof nm.Addition ? `(${part})` : part);
    }
    return parts.join(' ');
}

/* A base that is a sum or a product is bracketed, so that it does not run
 * into the caret. `nm.Power.to_latex` brackets the same case. */
function power_string(target: nm.Power): string | undefined {
    const base = numeric_string(target.base);
    const exponent = numeric_string(target.exponent);
    if (base === undefined || exponent === undefined) {
        return undefined;
    }
    const bracketed = target.base instanceof nm.Associative ? `(${base})` : base;
    return `${bracketed}^{${exponent}}`;
}

function logarithm_string(target: nm.Logarithm): string | undefined {
    const base = numeric_string(target.base);
    const argument = numeric_string(target.argument);
    if (base === undefined || argument === undefined) {
        return undefined;
    }
    return `log_{${base}}(${argument})`;
}

function cumulative_gaussian_string(target: nm.CumulativeGaussian): string | undefined {
    const argument = numeric_string(target.argument);
    if (argument === undefined) {
        return undefined;
    }
    return `\\Phi(${argument})`;
}

function sigmoid_string(target: nm.Sigmoid): string | undefined {
    const argument = numeric_string(target.argument);
    if (argument === undefined) {
        return undefined;
    }
    return `\\sigma(${argument})`;
}

function is_positive_string(target: nm.IsPositive): string | undefined {
    const argument = numeric_string(target.argument);
    if (argument === undefined) {
        return undefined;
    }
    return `\\mathbbm{1}_{${argument} > 0}`;
}

function rectified_linear_string(target: nm.RectifiedLinear): string | undefined {
    const argument = numeric_string(target.argument);
    if (argument === undefined) {
        return undefined;
    }
    return `\\mathrm{ReLU}(${argument})`;
}

function sign_string(target: nm.Sign): string | undefined {
    const argument = numeric_string(target.argument);
    if (argument === undefined) {
        return undefined;
    }
    return `\\operatorname{sign}(${argument})`;
}

function absolute_value_string(target: nm.AbsoluteValue): string | undefined {
    const argument = numeric_string(target.argument);
    if (argument === undefined) {
        return undefined;
    }
    return `\\lvert ${argument} \\rvert`;
}

function larger_of_string(target: nm.LargerOf): string | undefined {
    const first = numeric_string(target.first);
    const second = numeric_string(target.second);
    if (first === undefined || second === undefined) {
        return undefined;
    }
    return `\\max(${first}, ${second})`;
}

function square_root_string(target: nm.SquareRoot): string | undefined {
    const argument = numeric_string(target.argument);
    if (argument === undefined) {
        return undefined;
    }
    return `\\sqrt{${argument}}`;
}

/* The bounds are written on the closing bracket only where they are not the
 * unit interval, as `nm.Clamp.to_latex` writes them. */
function clamp_string(target: nm.Clamp): string | undefined {
    const argument = numeric_string(target.argument);
    const lower = numeric_string(target.lower);
    const upper = numeric_string(target.upper);
    if (argument === undefined || lower === undefined || upper === undefined) {
        return undefined;
    }
    const clamped = `\\ulcorner ${argument} \\lrcorner`;
    return target.clamps_to_unit_interval()
        ? clamped
        : `${clamped}_{${lower}}^{${upper}}`;
}
