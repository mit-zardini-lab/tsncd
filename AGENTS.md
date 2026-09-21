# Repository instructions

Read [CLAUDE.md](CLAUDE.md) in the repository root before starting any task.
Follow its instructions for all work in this repository.

## Preserve the diagram theme layer

Dark mode defaults to `true` in `RenderHandlerSettings`. Keep theme adaptation in
`Render/DiagramTheme.ts` and apply it at the drawing backend. Derive reusable color
changes through `utilities/Color.ts`. Both themes share the layout and update pipeline.

Keep colored operation outlines confined to `BlockOperatorBox` and leave annotation
text unfiltered. A block and its associated operator share the same hover tint.
Tape hover halos follow the tape's color and disappear when the pointer leaves the
array's plate, which covers its tapes, arrowheads and names. Axis halos follow the
wire's color and light every wire and name of the axis, and the legend row with it.
Ordinary operation glyphs retain their own styles.

`blockBackground` selects `none`, `subtle`, `medium` or `strong` dark-mode enclosure
fills. The default is `subtle`. `blockHoverIntensity` defaults to `0.12` for both the
block and its associated operator.

Python mode arguments default to `None`, which leaves the renderer setting unspecified.
`ColorMode.DARK` and `ColorMode.LIGHT` serialize to the existing `darkMode` boolean.

Validate diagram changes against the full term held by the server. Use
`npm run capture -- --output tmp/current.png` to inspect the connected page's rendering.
Check both themes and preserve the user's displayed diagram during capture.
