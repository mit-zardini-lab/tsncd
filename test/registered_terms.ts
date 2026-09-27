// Claude Opus 5.5 (1M context), effort 40.
/*
 * Every module that registers a term class with `fd.register_term`, imported
 * for its registrations, so a test can import any term `pyncd` exports. The
 * list is the data-structure modules `src/index.ts` establishes.
 */
import * as cat from '../src/data_structure/Category';
import * as para_wrap from '../src/para/data_structure/ParaWrap';
import * as para_block_operator from '../src/para/data_structure/ParaBlockOperator';
import * as contravariant from '../src/para/data_structure/Contravariant';
import * as multicategory from '../src/para/data_structure/MultiCategory';
import * as quantization from '../src/quantization/data_structure/Quantization';
import * as affine_guards from '../src/advanced_axis_dynamics/data_structure/AffineGuards';
import * as advanced_axis_operators from '../src/advanced_axis_dynamics/data_structure/Operators';
import * as axis_concatenation from '../src/advanced_axis_dynamics/data_structure/AxisConcatenation';
import * as caching from '../src/caching/data_structure/Caching';
import * as deepseek from '../src/deepseek/data_structure';

export const REGISTERED_MODULES: readonly object[] = [
    cat, para_wrap, para_block_operator, contravariant, multicategory,
    quantization, affine_guards, advanced_axis_operators, axis_concatenation,
    caching, deepseek,
];
