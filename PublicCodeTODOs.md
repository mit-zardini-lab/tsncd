# TODO notes lifted out of the public `tsncd`

These were `TODO` comments in the public repository. They were removed from
the source before release and recorded here so nothing was lost. Line numbers
are from the public tree at the time of removal, and shift as it changes.

## `src/data_structure/BroadcastedCategory.ts` (was line 40, in class Array)

`WeaveMode` is not registered the way terms are.

Removed:

```
// TODO: Register enums
```

## `src/data_structure/BroadcastedCategory.ts` (was line 108, in class Broadcasted)

`Broadcasted.degree()` cannot check that every reindexing shares a domain without a working structural equality.

Removed:

```
// TODO: implement all equals
// return util.iallequals(this.reindexings.map(r => r.dom()));
```

## `src/data_structure/Numeric.ts` (was line 165, in class Power)

`Power.numeric_hash` is wrong for negative exponents, so those compare by structural hash instead. Related: the Python side dropped modulo-hash equality entirely in favour of structural equality.

Removed:

```
// TODO: This will not work properly as x^-y will be <1, so it falls back
// to the structural hash.
```

## `src/data_structure/Numeric.ts` (was line 190, in const Zero)

The numeric port stops short of the full set the Python side has.

Removed:

```
// TODO: Rest of the numerics.
```

## `src/data_structure_processing/term_utilities.ts` (was line 75, in function isIdentity)

`isIdentity` on a product recurses per component rather than comparing terms.

Removed:

```
// TODO: Proper equals
```

## `src/display/Framework/BroadcastedCategoryRenderer.ts` (was line 42, in const datatypesRegistry)

The datatype anchor triangle dimensions are hard-coded constants.

Removed:

```
// TODO: Magic Numbers
```

## `src/display/Framework/BroadcastedCategoryRenderer.ts` (was line 417, in class BroadcastedBox)

`core_width` is derived from a max over box dimensions with unexplained terms.

Removed:

```
// TODO: Magic!
```

## `src/display/HTMLRender/HTMLDrawHandler.ts` (was line 71, in const _svg)

The SVG is positioned by a fixed OFFSET instead of a real buffer region.

Removed:

```
// TODO: Create a proper buffer
```

## `src/display/Render/RenderHandler.ts` (was line 122, in class CoreElement)

Marked TODO above the AnnotationElement note. The explanation itself was kept in place - EventHandlers still need to treat annotations specially.

Removed:

```
// TODO:
```

