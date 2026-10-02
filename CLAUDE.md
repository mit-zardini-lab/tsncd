# Working in this repository

`tsncd` draws the pictures. It takes an algebraic term that `pyncd` built, serialised to
JSON, and renders it as a neural circuit diagram in a browser. It does almost no algebra
of its own. The one functor here is `src/quantization/algebra/strip_quantisations.ts`,
which takes every quantisation off a term so that a page can draw a model in the reals
from the quantised model it carries. It mirrors `pyncd`'s
`quantization/algebra/strip_quantisations.py`. Every other question of the form "why is
this expression shaped like that" is a `pyncd` question. The sibling Python checkout is
`../pyncd`.

`README.md` says what the package is for. `PROTOCOL.md` is the wire contract between the
two repositories, and is **mirrored** as `Diagram Wire Format.md` in the `backends` folder
of `pyncd`'s `obsidian/` vault. Edit both copies together. This file is how to work in the
TypeScript.

**`pyncd` is canonical.** The `data_structure/` tree here is a hand port of the Python one.
When the two disagree, the Python is right and this is behind. When you need something new
in the data structure, port it rather than inventing a TypeScript-shaped equivalent. The
two are meant to stay readable side by side.

**Inspect rendered diagrams as images.** `npm run capture -- --output tmp/current.png`
fetches the server's held term and requests a PNG from a connected diagram page.
Open the saved image with an image viewing tool. `--watch 2000` repeats the capture.
The request uses the off-screen target and preserves the displayed and held diagram.
The connected page must run the current bundle.

`pyncd` can also capture headlessly with
`await save_figures({'x': term}, format='png')`, which writes `./outputs/x.png`.
Build with `npm run build` before using the headless path.

For reading the *algebra* of a term, use `pyncd`'s `agent_display`, not anything here.

## Diagram themes share the rendering pipeline

`defaultRenderHandlerSettings.darkMode` is `true`. `darkMode: false` selects light mode.
`Render/DiagramTheme.ts` adapts colors, surfaces and enclosure outlines at the backend.
The theme applies to initial draws, later attribute changes and annotations through the
same update pass. Keep geometry independent of the theme. Derive color transformations
through `utilities/Color.ts`, so that a theme and a box that paints itself share one set
of them.

Colored operation outlines belong to `BlockOperatorBox`. Its default outline is 1px
and its highlighted outline is 1.5px. Keep annotation text unfiltered and preserve the
styles of other operation glyphs. A block and its associated operator use the same
surface tint through `Color`. `blockHoverIntensity` defaults to `0.12`.

`blockBackground` controls dark-mode enclosure fills. It accepts `none`, `subtle`,
`medium` and `strong` and defaults to `subtle`. Light-mode enclosure fills retain
their existing colors. A taped array is one hit target: `ParaWrapBox` paints a
plate on the background layer over the strip between the array's first and last
tape, from the arrowheads to the row they reach and not over the slot name,
invisible until the slot is highlighted, and a pointer resting on the plate
lights every grab and drop of the slot, its tape halos and its plates. Beside
each plate stands a padlock, drawn by `Render/padlock.ts` in the slot's colour
and painted only while the slot is lit or locked. A click on a plate locks the
slot under `slot-lock`, a `Render/locked_highlights.LockedHighlights` that the
legend's rows share, and `slot-lock:<uid>` is the second token it sets, which is
what closes the padlocks. An axis
is lit under `axis:<uid>` through its wire halos: `AxisAnchor` draws a wider
invisible stroke under every wire and lights it, and every name of the axis
glows, wherever the axis is highlighted. Every halo, around a wire, a tape or a
name, is drawn in `DiagramTheme.highlightHaloColor`, which is a blue in each theme.
`cr.link_halo` and `HTMLAnnotationHandler` read it, so a halo around a black wire
stands out in light mode. `settings.axisHover` says what sets
the token. `settings.axisLabelFontSize` is the size in em an axis label is drawn
at, 0.8 where a message names none. `AxisProcessor.annotation_settings` reads it
through `rhs.axis_label_font_size`, as does every place that measures the room a
label needs, so the layout follows the size the label is drawn at. No other
label reads it. Under `legend`, the default, the legend row alone does, through
the `uids` its row carries. Under `everywhere` the halo is also the hit target the
pointer rests on, and a name sets the token too. Under `off` nothing is drawn or
linked. A label carries a `halo_token` and `hover_tokens`, and
`HTMLAnnotationHandler` links both on every placement, so a name in a gap and a
name on a tape answer alike.
A grab writes its slot name above its operation and that array's axis names on the
line below it. A drop writes its slot name below its operation and the axis names on
the line above it. An axis name wider than the room between its tape and the next is
turned a quarter turn clockwise and runs down its tape, and every other axis name of
its array is turned with it. A grab's tape runs down to the top edge of the operation
and a drop's tape rises from its bottom edge, whatever room the degree wires take
between the row and the glyph. A tape whose wire turns at its row anchor, which is a
degree axis leaving for a column, ends at the row. A wrap over a `Rearrangement` takes
the run of its tapes out of the body it passes through, so a wrap over the identity on
one wire, which is what a bare `Grab` or `Drop` is drawn as, has nowhere to run.
`ParaWrapBox.body_shorter_than_its_tapes` reports that case, `tape_run_room` asks for
the room the run needs, `post_placement` moves the columns into it as it moves an inner
box, and `elbow_row_free_end_y` measures the free ends from the anchors so one line
carries the whole row and its arrowheads stay level.

Keep Linear annotation text at its existing size when adjusting width padding.
Reindexing glyphs use `minimum_reindexing_height` from the stride settings.
An operator that carries a reindexing as a field of its own draws it through
`CovariantStrideRenderer`, which reads those same settings and puts the
reindexing's domain on the left. `ReindexTranspose` and `CovariantView` are the
two such operators, and each reserves the height any other reindexing does.

Python mode arguments default to `None` and omit `darkMode` from the wire settings.
The renderer then applies its own default. `ColorMode.DARK` and `ColorMode.LIGHT` provide
explicit choices. Existing boolean arguments remain supported. Capture backgrounds
default to `auto` and follow the resolved theme. An explicit CSS color selects the
export background, and `background=None` requests transparency.

Use the full term currently held by the server for visual verification. Check dark and
light mode with the same term and settings. The figure the page boots with is the
standing regression example, and the fixtures under `test/fixtures/` are smaller ones.
The design reasoning is recorded in `Diagram Themes.md`, in the `backends` folder of
`pyncd`'s `obsidian/` vault.

## The advanced display lives in its own folder

`src/advanced_display/` holds the legend and the inspection boxes, and its `index.ts`
is what `src/index.ts` references. Both read the `auxiliary` field a message carries
beside its term, which `PROTOCOL.md` states, and both are decorators a render target
runs after it draws, installed through `src/display/diagramRenderTarget.ts`. The
renderer core gains one hook for them: `BroadcastedBox` registers the core of every
operator glyph with `RenderHandler.register_term_region`, and the boxes hit-test those
rectangles under the pointer rather than adding elements over the drawing. A block is
keyed by its tag's uid and a `Broadcasted` by the number `json.ts` gives it as it is
constructed, so nothing in this folder does algebra. `settings.legend` and
`settings.inspectionBoxes` default to false, and a message that sends neither draws
as it did before the folder existed. The design is recorded in `Advanced Display.md`, in
the `backends` folder of `pyncd`'s `obsidian/` vault.

The legend names its own axis column, through `scr.axis_annotation_text`, which labels
the axis's wire through the `AxisProcessor` registered for its class: a row and the wires
it stands for then read alike, and a row whose axes come out under two labels is drawn as
one line per label. `find_axes_by_uid` finds the axes of the term by the uids the row carries,
in one walk that enters each node once. Clicking a line locks its halo on under
`legend-lock`, beside the source the pointer sets, and `inspectionBoxes.ts`
registers the handler of each box's diagram with
`locked_highlights.register_every_lock` so a lock reaches inside an open box. The
click calls `stopPropagation`, because the table is inside the diagram container
and the boxes close on a click the page outside them answers. `referenceIcons.ts` holds the icon each `CodeReferenceRecord` names, and
the sender chooses the name, so nothing here reads a url.

A block whose `BlockAesthetics.drawing` is `BlockDrawing.BODY_IN_PLACE` is drawn as
its body alone. `bb.broadcasted_box` builds the box of the body `Broadcasted` and
registers it under the wrapper, so the figure is the bare operator's and the box the
pointer opens is the block's. The block's body is not queued as a sub-diagram, and
its inspection box draws no diagram of its own.

An inspection box is a core width with a padding either side of it, and `boxWidths.ts`
holds both. The text of a box occupies the core width, and the diagram under the text
is wrapped so that the drawing and the ink that overhangs it together occupy that
width, so every box of a page holding no scrollbar is laid out at one width whatever
it holds, with the same padding either side of its text. A box taller than the window
scrolls, and the scrollbar a browser draws inside such a box takes room from its
content, so `give_box_its_core_width` lays the box out at the core width, measures
what the scrollbar took through `drawn_scrollbar_width`, and lays it out that much
wider again. Without the second width, a box that scrolls loses fifteen pixels of its
content to the scrollbar and a drawing occupying the whole core width reaches past it,
which is a horizontal scrollbar under the drawing. A browser drawing its scrollbars
over the content takes nothing, and such a box keeps the first width. The overhang
is measured only once a drawing stands in the document, so `draw_within_core_width`
wraps the first drawing at the core width less the room the draw layers take and draws
the term again, narrower, where the drawing came out wider than the core. A row is
broken between two operations, so a row holding one wide operation comes out wider than
the width it was wrapped at, and `boxWidths.narrowed_wrap_width` takes that excess off
the next wrapping. `test/box_widths.test.ts` asserts the arithmetic.

## Two arrow forms are drawn by `display/Framework/arrows/`

`settings.form` selects one of three forms for each message, and
`diagramRenderTarget.make_render_target` builds one renderer for each. The default,
`all-broadcasted`, draws every axis of an array as a wire of its own, which is how every
figure was drawn before the other two forms existed. The other two forms draw each array
that passes between two operators as one arrow.

`ArrowRenderer` draws the form `arrows-and-broadcasted`. It answers `display_lone` and
`display_prod_object` with an arrow, which is one anchor for the whole array, so every
composition, product, rearrangement, block and multiline row built by the generic code in
`CategoryRenderer.ts` carries one arrow per array. An arrow is stroked heavier than an
axis wire. `arrowLabels.ts` writes its label in two lines, with the array's shape in
brackets above the wire and its datatype below it. The datatype is the array's
quantisation where the array carries one, so every arrow states the format its array is
held in. A `Broadcasted` keeps the `BroadcastedBox` of the axis form. `ArrowCappedBox`
stands that box on a plate, which is a rounded rectangle in the theme's surface tint. At
the left edge of the plate the arrow of each operand opens into the wires of its axes,
and at the right edge the wires of each result close into its arrow. The whole plate
opens the operator's inspection box.

`BoxRenderer` draws the form `arrows-and-boxes`. It draws the same arrows, and it draws
each `Broadcasted` as an `OperatorFaceBox` with one arrow entering per operand and one
leaving per result, so nothing of the broadcasting is drawn.
`operatorFaces.facesRegistry` builds what stands inside the box from the operator's
class. Both arrow forms write a name above each operator. The name is the one
`plateNames.plateNamesRegistry` holds for the operator's class, such as `Linear` over a
`Linear` and `Cache` over a cache, and the operator's own name for a class that
registers none. A glyph that writes the name already reports it through
`bb.OperationBox.names_itself`, a face reports it as its `written_name`, and the name
above the operator is then left off.

`ArrowParaCategoryRenderer` draws a `ParaWrap` over either arrow renderer. A taped array
stays in its operator's column, and `ParaWrapBox` bends its tape into the array's arrow
along a level leg that carries the arrow's label. A wrap drawn mirrored turns its tapes the other way,
per *A mirrored region points its arrows and turns its tapes to the left*. A conversion carrying no name has no
glyph, so `bb.OperationBox.written_datatype_color` has the datatype below its result's
arrow written in `thin_cast_label_color`, and that label also opens the conversion's
inspection box. `test/arrow_display.test.ts` and `test/box_form.test.ts` hold the tests,
and `PROTOCOL.md` states the three forms under the `form` setting.

## A page switches its form, its theme and its variant

`src/advanced_display/displaySelector.ts` holds the switch between the three forms and
the two themes. The page keeps the last term its display target drew, with the settings
and the auxiliary information it was drawn with, and a switch draws that term again
through the same `termPass` with one setting changed. Where `settings.controls` is
`shown`, the module draws one row of controls under the heading, outside the diagram
container. The row holds the selector of variants on a page carrying several, then the
buttons of the form and of the theme. `controls` defaults to `hidden`. The lab website
embeds its pages that way and draws a toolbar of its own.

A variant is one version of a model, such as the model at the quantisations of its
released checkpoint or the same model in the reals. A page may carry several variants in
place of one message, in a `script` element with the id `tsncd-variants`.
`src/data_transfer/embedded_variants.ts` reads the element. Its records are compressed
into one repository, in the form `json_compression.ts` decodes, so a record two variants
share is stored once. `advanced_display/variantFigures.ts` builds each variant the first
time it is asked for and keeps it, and `variantSelector.ts` draws the selector and holds
the switch between variants. A variant either carries a message of its own or names the
variant it is derived from and a functor, which `derivedFigures.ts` applies.
`dequantise` is the one functor. It runs `strip_quantisations.ts` and then
`data_structure_processing/share_block_tags.ts`. The quantisation pass of `pyncd` gives
each quantised body of a box a tag of its own, and the second pass gives one tag back to
the blocks whose bodies became equal once the quantisations were taken off.

`advanced_display/pageChoices.ts` reads five query parameters of the page's address,
`variant`, `form`, `darkMode`, `controls` and `displayMode`, before anything is drawn.
It refuses an address that names another parameter, repeats one, or gives one a value
outside those it takes, and a refused address draws no figure and says why. The address
alone decides the form and the theme in which the page's own figure opens. Where it names
neither, the figure opens in the all-broadcasted form and in the theme the system asks
for, and `follow_system_theme` draws it again when that theme changes until a theme is
picked. The page writes the variant, the form and the theme on display into its address
after every switch, and it keeps nothing in `localStorage`.
`advanced_display/hostMessages.ts` posts a `tsncd-state` message to a host page holding
the page in a frame after every draw, and answers a `tsncd-display` message from the
host through the same checked switch. `window.tsncd.display` and `window.tsncd.variant`
give a driving browser the same switch, and `window.tsncd.variants` lists the variants
the page carries. `PROTOCOL.md` states the
element, the address and the messages. `test/variant_pages.test.ts`,
`test/display_selector.test.ts`, `test/page_choices.test.ts`,
`test/host_messages.test.ts` and `test/strip_quantisations.test.ts` hold the tests.

## A mirrored region points its arrows and turns its tapes to the left

`ContravariantBox` draws a `Contravariant` as its body mirrored, which is how the
backward pass of a training step is drawn, and the data of a mirrored region travels
from right to left. `DiagramElement.mirror` reverses the children of every horizontal
element, which moves every anchor to its mirrored place, and sets `mirrored` on every
element it reaches, true where the element has been mirrored an odd number of times. A
mark drawn inside one rectangle is still drawn the ordinary way round, so the code that
draws a mark saying which way data travels reads `Render/travelDirection.ts`. The user
asked for the arrows of a reversed category to point right to left on 2026-09-27.
`travel_direction(element)` is right to left for a mirrored element, and
`wire_travel_direction(start, end)` is right to left for a wire whose two ends are both
mirrored. A wire joining a mirrored region to the covariant composition that holds it
is therefore read left to right, as that composition is. The direction triangle of an arrow and of a datatype
wire, the two heads of an elementwise map in the axis form and in the arrow form, the
head a dangling natural wire ends in and the chevron of a complex pairing in
`deepseek/display_deepseek.ts` each point left in a mirrored region. A
triangle keeps the tip the covariant triangle has. A head is reflected across the middle
of the name it stands beside, or across the notch at which its wire ends, with
`reflect_polygon_for_travel`. `ElementwiseArrowBox.mirror` moves `runs_through_a_map`
to the arrow the map's wire is drawn from, so the run of a mirrored map still carries no
triangle. `settings.reversed` is a different setting. The stride renderer reads it to
draw a reindexing with its codomain on the left in every region.

In a mirrored `ParaWrapBox` every elbow turns its corner on the other side of its
anchor, which `pwd.elbow_side` gives. A grab comes down from above and turns left into
its anchor, and a drop leaves its anchor to the left and turns down. The rule holds for
every tape that turns a corner, which is every tape of the arrow forms and every tape of
a wrap over a `Rearrangement`. The room the legs of the arrow forms take moves to the
other side of the inner box with the column the legs reach.
`level_kept_wires_beside_legs` levels the wrap's column on the side of the legs, and the
slot name of a leg's tape stands right of its arrowhead, with its padlock at the right
end of its plate, which is where the mirror carries the name of a covariant leg. The box
form sets `box_result_label_inset` on the arrows of the column drawn on the right, so
the label in the gap after a mirrored box starts as far clear of the box as it does
after a covariant one. `ContravariantBox` mirrors its body after the body is built, so
`mirrored` is false in every constructor. A box reads it in `post_placement` and
`update`, and every width it reserves while it is built is the same on either side. A
figure holding no `Contravariant` is drawn as it was before the rule existed.
`test/arrow_display.test.ts`, `test/elementwise_arrow_geometry.test.ts`,
`test/glyph_geometry.test.ts` and `test/para_interaction.test.ts` hold the tests.

## A page may carry its own message, and the bundle carries its fonts

`src/index.ts` looks for a `dataUpdate` written into the page, in a `script` element
with the id `tsncd-embedded-message`, which `src/data_transfer/embedded_message.ts`
reads. A page holding one draws it and opens no websocket. `pyncd`'s
`websocket_transfer/standalone_page.py` writes such a page as one HTML file, with the
bundle written into it, and the file opens from `file://` with no server and no network.
`webpack.config.js` writes KaTeX's woff2 fonts into the bundle as data URIs for that
reason, so do not return the fonts to `asset/resource`. `settings.title` names what the
page shows, and `src/display/pageHeading.ts` writes `tsncd - <title>` into the tab for
the display target alone, and into the heading where `settings.heading` is `title`.
Under `none`, the default, the heading is hidden and the page holds the figure alone, so
it stands as a page of a site that writes its own heading above it. `public/index.html`
paints the page in the dark canvas colour before the bundle runs and shows a turning
ring, and `src/display/loadingScreen.ts` repaints the page in the theme of the message
once the message is known and removes the ring at the first draw. `PROTOCOL.md` states
all of them, under *A page that carries its own message*, the `title` and `heading`
settings and *Fonts*.

## A page with no message of its own fetches the figure it boots with

`src/data_transfer/boot_message.ts` names the file the page fetches,
`public/json_files/deepseek_v41_flash_text_only_quantised.json`, which
`webpack.config.js` writes into `dist/` at the same path through the `emitBootMessage`
plugin. It holds one `dataUpdate` carrying the quantised text-only
DeepSeek-V4.1-Flash drawn without the bodies of its blocks, with the legend of its axes
and an inspection box over every block and every operator, which the
`DiagramMode.BROWSER` cell of `pyncd`'s
`notebooks/sota/DeepSeekV41Flash.ipynb` builds. The file runs to
12.5 MiB, so it is served rather than imported, and adding an `import` of it to a module
would write every byte into the bundle.

`index.ts` opens the socket before it fetches the message, and `draw_boot_figure` tests
`a_figure_has_been_drawn` in the same synchronous run as the draw it guards, so a term
the relay holds and a term `window.tsncd.render` draws each keep the screen.
`recording_each_draw` wraps the display target and is what sets that flag, so every
sender records its own draw. The boot figure is drawn through the same `termPass`, with
the message's own settings and auxiliary information, so its legend and its inspection
boxes answer the pointer. The address of the page decides the form and the theme of the
boot figure, as it decides them for a page's own message, per *A page switches its form,
its theme and its variant*. `PROTOCOL.md` states the mechanism under *The figure a page
boots with*.

## How to write here

These rules apply to code, comments, commit messages, `PROTOCOL.md` and agent responses.
They are `pyncd`'s writing rules carried into TypeScript; `pyncd/CLAUDE.md` holds the long
form of the prose rules, with rejected examples beside their replacements. **When a
reviewer corrects the writing in this repository, add the correction to this section.**
Name the construction being ruled on, using the ordinary grammatical term where one
exists, and give one example of the rejected form beside its replacement.

Three commitments organise everything below. The package is **modular**: behaviour
attaches to classes through registries, and the display layers import in one direction.
The code is **functional**: terms are immutable, queries are pure, and mutation is
confined to the render pipeline that owns it. The names and types **align with the
mathematics**: the `data_structure/` tree reads side by side with `pyncd`'s, and a
signature states the categorical structure it operates on.

***Code should be self-commenting. EVERY COMMENT IS A FAILURE.***

### Prose

Write plain English. Use the words a working practitioner would use, in ordinary
sentences.

- Give every demonstrative an explicit antecedent. A sentence beginning *This is* or
  *That makes* points back at a whole preceding sentence. Repeat the noun instead.
- Put one idea in one sentence. Do not join fragments with commas, semicolons or dashes,
  and do not interrupt a sentence with a parenthetical clause set off by dashes.
- The colon splice is a fragment join like any other. *Drop shadows: free. Annotations:
  the whole problem.* becomes *The drop shadows carry over unchanged. The annotations
  are the whole problem.* A colon may still introduce a list or a quotation.
- Open a sentence with its subject and a finite verb. A sentence opening on a past
  participle states nothing until its main clause arrives: *Measured on the transformer,
  the round trip takes 2.3 seconds* becomes *The timings below were measured on the
  transformer. The round trip takes 2.3 seconds.*
- Do not state a rule with the *X, not Y* figure. Antithesis is a fatal cliche. Write the
  instruction as an imperative sentence naming what to do.
- Write a heading with a finite verb or a fully named subject, so it reads alone, out of
  order, with nothing else on the screen.
- Define a technical term the first time you use it. *Anchor*, *meridian*, *weave*,
  *degree* and *target* have the meanings this file gives them; use them in those senses
  and no others.
- Do not give a component an action it cannot perform. An anchor records a point and
  draws a wire; it does not want, refuse or decide anything.
- State facts. Do not narrate, do not evaluate what you describe (*elegant*, *clever*,
  *unfortunate*, *genuinely*, *simply*), and do not use capital letters for emphasis.
- Bold marks a term the reader will look for, and never emphasis. *The renderer holds
  **no text geometry at all**.* becomes *The renderer holds no text geometry.* A bolded
  lead-in to a paragraph, as the rules below use, is the one place it belongs.

### Names

A reader should understand a name without opening the file it is defined in.

**Name a function after the action it performs and the thing it performs it on.**
`find_broadcast_display_type`, `make_composed_gap` and `split_category` all do this. A
bare `draw()` or `process()` names an action with no object and sends the reader into
the body.

**Name a boolean after the condition it reports.** `is_mappable` and `allow_skip` state
conditions. A boolean named for a place or a shape makes the reader find the definition
to learn what is being asked about it.

**Do not select between two behaviours with a boolean parameter.** Write two functions
and name each after what it does. A boolean field in a settings interface is a different
construction: `reversed` in the stride renderer settings is data the renderer reads, and
the field name appears at the construction site.

**Do not give a new module, class or variable a single common English word as its name.**
One word names a subject and leaves the reader to guess the action.

**Use a single letter only for a loop counter or a generic type parameter.** The generic
letters are fixed by the data structure: `L` is an object label, `M` a morphism bounded
by `cat.Morphism<L>`, `A` the label an anchor carries, defaulting to `L`. A new letter
gets the same treatment: one letter, one meaning, stated in its bound.

**Casing records where a name comes from.** snake_case for methods and fields that mirror
`pyncd` (`display_category`, `left_anchors`, `to_latex`, `block_tag`), so the two trees
read side by side. lowerCamelCase where the name crosses the DOM, webpack or the wire
(`renderHandler`, `msgType`, `debugBorders`). UpperCamelCase for classes, types and
enums; CONSTANT_CASE for enum values and module constants (`WeaveMode.TILED`, `BUFFER`).
Follow the file you are in.

**Import a module as a namespace, under its fixed alias.** The aliases appear in every
file and a reader learns them once: `rh` RenderHandler, `rhs` RenderHandlerSettings,
`cr` CategoryRenderer, `crs` CategoryRendererSettings, `bb` BroadcastedCategoryRenderer,
`scr` StrideCategoryRenderer, `cat` Category, `ops` Operators, `fd` Term, `nm` Numeric,
`nmr` NumericRenderer, `dhd` DrawHandler, `ut` utilities, `pt` Point, `tu`
term_utilities, `utcr` ConstructorRegistry, `mlc` Multiline, `wst`
websockets_transfer. A module outside the set is imported under its own basename, as
`Quantization` and `quantisation_labels` are.

### Comments

Make the code state its own meaning first. Reach for a better name before reaching for a
comment, and delete a comment that a rename has made redundant. Delete a comment that
repeats the line below it. When a comment names an algorithm, extract the algorithm into
a function with that name and delete the comment.

Write a `/** */` doc comment only when it states something the signature cannot: a
precondition, a unit, a phase. The render pipeline is where most such claims live —
`rectangle()` throws before the element is materialised, and a method that may only run
during `post_placement` or `update` says so.

A browser fact the code cannot state is the standing exception. The comment above
`makeOffscreenContainer` records why the container is parked with `transform` rather than
`left`; each comment of that kind saves the next reader the experiment that established
it. Write one where the fact is load-bearing and nowhere else.

Do not add commented-out code, and delete any that your change touches. The previous
version is in the git history. The graveyards listed under *Things that will mislead you*
predate the rule.

The mathematics lives in `pyncd`, in its `obsidian/` vault. Do not restate the theory in
a comment here; name the `pyncd` module or note that holds it. What belongs here is
geometry: what a box measures, where it puts things, and in which phase.

### Typing

Annotate every function and method, the arguments and the return type. Write the accurate
type even when the categorical structure makes it long, as in `ProdCategory<L, M extends
Morphism<L>>`. When porting a Python signature, carry the generic over bound for bound:
`def f[T: fd.Term](t: T) -> T` becomes `function f<T extends fd.Term>(t: T): T`. *It will
make the user very happy if you can add types to functions that lack them, especially
where there is a category-theoretic aspect.*

An `any` is tolerated only at the JSON boundary — `data_transfer/json.ts` and the
registries in `Term.ts` and `ConstructorRegistry.ts` — where the wire is genuinely
untyped. Elsewhere write the type, or take `unknown` and narrow it.

In `data_structure/`, spell each field the way the Python spells it: a dataclass field
defaulting to `None` becomes `readonly x: null | T = null`, and the constructor
parameters are `readonly` parameter properties in the dataclass's field order, because
reconstruction from JSON is positional (see *Adding an operator*).

### Code

Follow the
[Google TypeScript style guide](https://google.github.io/styleguide/tsguide.html), with
the departures listed at the end of this section. In particular: named exports only,
`const` unless reassigned, `===` everywhere except `== null`, braces on every control
statement, only `Error` subclasses thrown, no `var`, no prototype modification.

**Write in a functional style.** Return a new value rather than mutating an argument, and
never assign to a parameter. Everything in `data_structure/` is immutable — `ProdObject`,
`Weave` and friends are rebuilt rather than edited — and `data_structure_processing/`
holds pure queries and rewrites that return a new term. Mutation is confined to the render pipeline, whose later phases are
mutation by design: an element sets its own `transform` in `post_placement` and draws in
`update`. A box may move itself; it may not move a sibling.

**Keep imports flowing one way between the layers**, as *The layers* states. A change
that needs an import in the reverse direction belongs in a different layer.

**Put per-class behaviour in a registry, extended by a decorator.** Supporting a new
operator, datatype or block must not edit the renderer. Register every concrete class:
the registries match on exact constructor name with no superclass walk (see *The four
registries*).

**Pass configuration as a settings object.** Tunable numbers go in
`CategoryRendererSettings.ts`, partial settings are spread over the defaults
(`{...defaults, ...partial}`), and no module configures another by assigning to its
globals.

The departures from Google are:

- Namespace imports under the fixed short aliases, rather than named imports, because the
  alias set is stable across every file and a reader learns it once.
- snake_case for names that mirror `pyncd`, against `lowerCamelCase`, because the two
  trees are meant to be read side by side.
- Decorators are defined and used here — `@fd.register_term`,
  `@bb.opsRegistry.registerClass(...)` — against the rule to use only a framework's. The
  registries are this package's extension mechanism, and the decorators are standard ES
  decorators (see *Invariants worth knowing*).
- The `data_structure/` types are classes rather than interfaces, because
  `TermJSONConverter` reconstructs positionally and the registries key on the constructor
  name. Interfaces remain the right form for settings and handler contracts, as in
  `CategoryRendererSettings.ts` and `DrawHandler.ts`.
- A glyph's intrinsic size may be hardcoded in its `super()` call rather than lifted into
  settings.

## Where to start reading

Top-down, unusually, because the entry point is short and lays out the whole shape:

1. `src/index.ts` (524 lines) — the entire boot sequence: registries, the check of the
   address, the variants a page carries, the two render targets, the socket client, the
   `window.tsncd` hook.
2. `src/data_structure/Category.ts` — the three category type aliases and what re-exports
   what. Then `ProductCategory.ts` and `BroadcastedCategory.ts` beneath it.
3. `src/display/Render/RenderHandler.ts` — `DiagramElement`, `Vertical`/`Horizontal`/
   `CoreElement`, `AnnotationElement`, and the abstract handler interface.
4. `src/display/Framework/CategoryRenderer.ts` (2064 lines, the core) — `Meridian`,
   `Anchor`, `MorphismBox`, and the boxes for `Composed`, `ProductOfMorphisms`, `Block`,
   `Rearrangement`.
5. `src/display/Framework/BroadcastedCategoryRenderer.ts` — `BroadcastedBox` and the three
   ways a broadcast can be drawn.
6. `src/display/Framework/Multiline.ts` — splitting one morphism across several rows.

## The layers

```
data_structure/              A port of pyncd's terms. Knows nothing about drawing.
para/, quantization/,        The port of each pyncd feature's data_structure/ folder, at
advanced_axis_dynamics/,     the same path, and deepseek/data_structure.ts for
caching/                     deepseek/data_structure.py. quantization/algebra/ holds
  <feature>/data_structure/  the dequantisation functor.
data_structure_processing/   Pure queries over terms (is_mappable, get_mapping, isIdentity,
                             find_axes_by_uid), the memoised rewrite of term_rewriting.ts
                             and the tag sharing of share_block_tags.ts.
utilities/                   Point, Rectangle, Curve, Color, zip/join/deep_equals, registries.

display/Render/              WHAT a diagram is: DiagramElement trees, draw and annotation
                             interfaces. No HTML, no category theory.
display/Framework/           HOW a category term becomes a DiagramElement tree. Category
                             theory, no HTML.
display/HTMLRender/          HOW a DiagramElement tree becomes DOM + SVG. HTML, no category
                             theory.

data_transfer/               JSON decoding, the wire types, the websocket client and
                             server, image capture. `diagram_server.ts` runs under
                             node rather than in the browser. The node entry point
                             that starts it is `src/run_server.ts`, beside
                             `src/index.ts`.
advanced_display/            The legend and the inspection boxes, run as decorators after a
                             render target has drawn, and the page's controls, variants,
                             address and messages to a host page.
display/Framework/para/,     Extensions: the boxes that draw a feature's operators and the
  quantization/, caching/,   labels it writes on a wire. deepseek/display_deepseek.ts sits
  advanced_axis_dynamics/    beside its own data structure, under src/deepseek/, instead.
display/Framework/arrows/    The two forms that draw each array between two operators as
                             one arrow.
```

The three-way split in `display/` is the point of the design: `Render` and `HTMLRender`
between them could be swapped for a React or canvas backend without `Framework` noticing,
and `Framework` holds everything that knows what a morphism is. Keep imports flowing one
way — `Framework` may import `Render`, neither may import `HTMLRender`.

## The data structure

Mirrors `pyncd`; its `CLAUDE.md` explains the theory properly. The short version:

An expression is a morphism in a **product category** (`ProductCategory.ts`): `Composed`
sequentially, `ProductOfMorphisms` in parallel, `Rearrangement` to permute/copy/delete
wires, `Block` to group. Leaves are seed morphisms. Two categories are instantiated:

- **St** (`StrideCategory.ts`): objects are `Axis`, morphisms are `StrideMorphism`. This is
  what a *reindexing* lives in.
- **Br** (`BroadcastedCategory.ts`): objects are `Array = [datatype, shape]`; the seed
  morphism is `Broadcasted`, bundling an `operator`, `input_weaves`, `output_weaves` and
  `reindexings` — plus `backup_degree`, the degree of a morphism whose own domain is
  empty, which has no reindexing to derive one from. It is a `ProdObject` on a morphism
  with an empty domain, empty in turn when that morphism is not broadcast, and null on
  every morphism that has inputs.

A **weave** is a shape whose entries are either an `Axis` or `WeaveMode.TILED`. The TILED
slots are broadcast over. The rest are the **target**, the array the operator actually
sees. `select_degree` / `select_target` project onto those two halves, and the renderer
uses them constantly to decide which anchors go into the operator and which route around
it. The **degree** is the shape the TILED slots stand for, shared by every weave of a
morphism.

Everything is a `Term` with a `@fd.register_term` decorator, which is what lets
`TermJSONConverter` rebuild it from JSON.

## How a diagram gets drawn

Four phases, and confusing them is the main way to waste an afternoon.

**1. Build.** `BroadcastedRenderer.display_category(term)` — via `multiline_render` in
practice — recurses over the term and returns a tree of `DiagramElement`s. Pure: no DOM is
touched, nothing is measured. Each box computes its size from `settings` and its children's
`dims`, bottom-up.

**2. Materialise.** `RenderHandler.add_child` → `_element_to_rendered` walks the tree and
creates one `<div>` per element, giving it a flex class chosen from the constructor name
(`Vertical` → `vertical-box`, `CoreElement` → `fill`, everything else `horizontal-box`) and
writing `dims` out as **inline px width and height**. So sizes are computed in TypeScript;
CSS flexbox only handles direction and alignment. The classes are defined inline in
`public/index.html`, not in a stylesheet. `applyAux` paints debug borders here, which is
why `settings` must be installed on the handler *before* `wipe()`/`add_child`.

**3. Place.** `post_placement()` recurses. Elements may now read real geometry with
`rectangle()` and shift themselves with `transform.offset` / `transform.positioning`.
`BroadcastedBox.apply_translation_update` is the archetype: it centres the operator glyph
on the mean y of its live anchors, which is only knowable once the browser has laid out.

**4. Draw.** `RenderHandler.update()` first **discards** the overlay — `HTMLDrawHandler
.update()` removes every SVG layer, `HTMLAnnotationHandler.update()` replaces the
annotation container — and only then recurses into the elements, which draw into fresh
layers. So `update()` on a *handler* is a reset and `update()` on an *element* is a draw.
Wires come from `Anchor.update()`, operator glyphs from each `OperationBox.update()`, KaTeX
labels from `AnnotationElement.place()`.

`rectangle()` **throws** before phase 2 (`get_rendered`: "has not been rendered yet"). If
you need a measurement, you need to be in `post_placement` or `update`, not a constructor.

Annotations are not children. An `AnnotationElement` is an instruction, placed into a
separate absolutely-positioned layer by `place(rect)`, and re-placed on every `update()`.

## Meridians, anchors and wires

A `Meridian<A>` is a vertical column of connection points; `.anchors` flattens it. An
`Anchor<A>` is one point — `settings.anchor_height` (20px) tall and zero wide. Boxes expose
`left_anchors` and `right_anchors`, and composition is `left.right_anchors.link(
right.left_anchors)`, which zips the two columns pairwise and records `further`/`prior`.

Wires are drawn per-anchor in `Anchor.update()`, one flat curve to each `next_terminal()`.

- **Skipping** is how a wire crosses several gaps without a kink. `ComposedGap
  .make_composed_gap` marks the shorter side's anchors `loose`; a loose anchor with a prior
  reports `skipped()`, draws nothing, and `next_terminal()` walks straight through it to the
  next real one. `allow_skip = false` pins an anchor that must stay visible (block edges,
  `SpreadBox` caps).
- **Dots** (`add_dot`) mark a wire with nothing feeding it — a deletion. Set by
  `RearrangementBox.setup_links` for unused domain elements, by `BroadcastedBox
  .link_weaves` for degree slots no reindexing names, and by `AxisAnchor.update` where wires
  fan in or out.
- `SeparatorAnchor` carries the dashed line between the components of a product object.
  `ComposedGap.aligned_anchors()` walks the two columns skipping unmatched separators, so
  the count of separators need not agree across a gap.
- **A spread's cap columns follow the body.** `ProductBox` wraps a factor narrower than
  the product in a `SpreadBox`, whose two pinned columns are laid out as one evenly
  spaced stack centred in the row, while the body's anchors stand wherever its own layout
  put them. `SpreadBox.post_placement` moves each column anchor to the height of the
  anchor its wire is drawn to, after the body is placed, so the cap carries a flat wire
  and the bend is drawn in the gap beside the spread. Before that, a wire jumped between
  the two heights inside a cap a few pixels wide, and two spreads nested before a tall
  operator made a staircase, which the user reported on 2026-09-21 around `W^{KV}` and
  before `Idx` of the Reindex attention. `MultilineSpreadBox` keeps its caps spreading,
  because its columns are the row's evenly spaced edge and its caps have the room.

## The four registries

| registry | keyed on | default | purpose |
|---|---|---|---|
| `TermDirectory` / `EnumDirectory` (`Term.ts`) | `@register_term` class name | none — throws | JSON → term |
| `opsRegistry` (`BroadcastedCategoryRenderer.ts`) | `cat.Operator` subclass | `OperationBox` | operator → glyph |
| `datatypesRegistry` (same file) | `cat.Datatype` subclass | `defaultDatatypeDisplay` | datatype → optional wire anchor, auxiliary label and axis annotation formats |
| `blocksRegistry` (`CategoryRenderer.ts`) | `cat.BlockAesthetics` subclass or `null` | `BlockProcessor` | block → fill, padding, highlight |

All of them match on the **exact constructor name**, with no superclass walk
(`ConstructorRegistry.getConstructor` is one `Map` lookup then the default). `ReLU extends
Elementwise` therefore does **not** get `ElementwiseBox`; it falls to the plain
`OperationBox`. Register every concrete class you want drawn.

A registration is either a class, through `registerClass`, or a function, through
`registerFunction`. Register a function where the box or the label depends on what the term
holds and not on its class alone.
`display/Framework/quantization/quantisationLabels.ts` registers one of each and is the
module to read for the pattern. A **quantisation** is the number format a value is held in
together with the size of that format in bits, and
`src/quantization/data_structure/Quantization.ts` holds it as `Quantified`. A `Quantified`
carries a `BlockScale` where one scale covers a group of elements, which is how a format
such as MXFP8 is written.

The module registers a datatype display for `Quantified`, which writes the format as a
label below the array's axes. Where the quantisation wraps a `cat.Natural`, the array is a
single index and the format hangs under that index's own wire, with the bound the index
counts to read above it. The module also registers an operator display for `TypeConvert`,
the operator reading a value of one datatype into another. A conversion carrying no name is
drawn as no glyph at all, on a core of no size, so that the labels on the two wires state
the rounding on their own. A named conversion that changes the quantisation is drawn as a
chevron whose two halves are as tall as the quantisations read and written by it, where
both of those sizes are held by `CAST_HEIGHT_FRACTIONS`. Every other named conversion is
drawn as a box carrying its name.

**A registration only exists if its module was evaluated.** Nothing imports
`additionalOperationBoxes` for a value, so webpack would drop it. `src/index.ts` keeps the
modules alive with `establish()` calls and bare `console.log(addops)` statements. They look
like debris; they are load-bearing. Deleting one silently removes a whole family of boxes.

## Adding an operator

1. Add it in `pyncd` first. It is a `cat.Operator` there.
2. Mirror the class into `src/data_structure/Operators.ts`, or into the `data_structure`
   folder of the feature it belongs to, with `@fd.register_term`. **Constructor parameter
   order must match the Python dataclass field order.** `TermJSONConverter.to_term`
   reconstructs positionally. It drops the JSON keys and passes the values in the order
   they appear, so a reordered field silently produces a term with its members swapped
   rather than an error. A class with no mirror stops the whole term from importing,
   wherever it is nested. Each `data_structure` folder of `pyncd` is mirrored by the folder
   of the same path under `src/`, and `Terms Mirrored in tsncd.md`, in the `backends` folder
   of `pyncd`'s `obsidian/` vault, gives the table.
3. Write the box in `display/Framework/Operations/additionalOperationBoxes.ts`, or in the
   display folder of the feature it belongs to, as
   `display/Framework/quantization/quantisationLabels.ts` holds the boxes for
   `Quantization.TypeConvert`. Decorate it `@bb.opsRegistry.registerClass(ops.Yours)`, and
   extend `bb.OperationBox`. Pass the core size as the third `super()` argument, and draw
   in `update()` against `this.rectangle()`.
4. Labels: `AnnotationElement` + `place(rect)`, or `annotation_handler.addAnnotation(rect,
   ann)`. The content is LaTeX, rendered by KaTeX.
5. If the reindexing should be drawn as an explicit node rather than routed around, set
   `this.override_display_type = bb.BroadcastDisplayType.NODE` in the constructor.
   `LinearBox` and `BlockOperatorBox` both do.
6. For the two arrow forms, register a plate name in `arrows/plateNames.ts` where the
   name written above the operator should differ from its own, and a face in
   `arrows/operatorFaces.ts` where the box form should draw more than that name. A box
   whose glyph writes the operator's name sets `names_itself`, so the name is not
   written twice.

`GenericOperatorBox` (a labelled white rectangle) is the fallback worth copying.
`display/Framework/caching/cachingBoxes.ts` is a small complete example. It draws
`Caching`, the operator an array passes through to be kept for the passes that follow,
as a cylinder carrying the name of the cache, and registers `Cache` as its plate name.

A datatype is added the same way, into `datatypesRegistry` rather than `opsRegistry`, and
what it registers is the anchor its wire is drawn with and the label written beside it.
`quantisationLabels.ts` is the example, and it registers a function because a quantisation
over an index is drawn with the wire of an index and a quantisation over an array of real
numbers is drawn with no wire at all.

## The three broadcast display modes

`find_broadcast_display_type` sorts a `Broadcasted` by what its reindexings look like:

- **WEAVE** — every reindexing is mappable, so no figure is needed: the degree wires route
  around the operator from outputs back to inputs. `link_weaves()`.
- **NODE** — one reindexing shared by all inputs, drawn as a single node the degree anchors
  pass into and fan back out of. `link_node()`, node drawn by the `StrideRenderer`.
- **JOIN** — inputs reindexed differently from each other. **Not implemented.** The box
  draws with its anchors unlinked. The plan is to mirror `expand_to_nodes`, which lives in
  `pyncd/algebra/node_expansion.py`. It returns one `View` morphism per input, each
  carrying that input's reindexing, beside a core whose reindexings are the degree
  identity, so every box it produces is drawn as a WEAVE or a NODE.

Sameness is tested with `ut.deep_equals` through `iallequals`, never `===`. Reindexings
carry no uid, so structurally identical ones arrive from JSON as distinct objects and a
reference test would send every multi-input broadcast to JOIN.

**One operand of a NODE box can bypass the node**, and
`BroadcastedBox.degree_bypasses_node` says which. An operand drawn on a row whose own
reindexing is a rearrangement has its degree wired straight to the far column, as WEAVE
wires one. The node stands in the core, so the wire it replaces left the row, crossed into
the middle of the box and came back out, and it drew the operand's degree as passing
through whichever reindexing `degree_reindexing` picked. A grabbed index on a `Linear` is
the case.

The `StrideRenderer` runs with `reversed: true` (`DefaultStrideRendererSettings`), so
`swap_anchors()` puts a reindexing's codomain on the left. That is deliberate: a reindexing
maps output degree indices to input degree indices, i.e. against the data flow, and drawing
it swapped keeps the picture reading left to right.

## Multiline

`settings.width` is the px at which a morphism wraps onto the next row, so that
`F₀; F₁ = F`. `Multiline.ts` implements this by *splitting the term*, not the picture:
`split_category` recursively returns `{box, target0, target1}` where `target0 @ target1 ==
target`, and `MultilineComposedBox` loops until nothing is left. A `Block` split across rows
becomes several `PartialBlock`s sharing a `BlockTag`, which is why only the first draws a
left bracket and only the last a right one.

The splitter includes each composed gap's visible labels and each row's end labels in
its width budget. `SpreadBox` distributes the remaining width between its two caps while
respecting their label widths. Multiline rows share one width. An indivisible operation
that exceeds the budget widens every row to fit.

Because it changes the number of rows, `width` controls the figure's **aspect ratio**, not
its scale. 750 suits a screen; 1000–1400 suits a paper column. `PROTOCOL.md` has measured
numbers.

The wires of a row that continues on the next stand 10px above their spread at the row's
start and 10px below it at the row's end, which `MultilineCurve.post_placement` sets on
the edge meridian alone, so each wire ends in a short curve. The user asked for that
curve on 2026-09-21, after a change that moved both meridians together and left the
wires flat at the edges was reverted the same day.

## Invariants worth knowing

**Two render targets mean two sets of renderers.** An off-screen capture cannot reuse the
display's handlers pointed elsewhere, because they hold per-container state: the measured
rectangles and the pending block references. `make_render_target` in
`display/diagramRenderTarget.ts` builds a fresh set per container.

**The off-screen container is laid out, not hidden**, and parked with `transform`, not
`left`. Both halves of that are load-bearing and the reasons are in the comment above
`makeOffscreenContainer` in `index.ts` and in `PROTOCOL.md`.

**KaTeX's stylesheet is bundled, never CDN-linked.** Capture inlines `@font-face` rules by
reading `cssRules`, which browsers refuse cross-origin; a fallback face changes the measured
text boxes, and the wires are drawn *from* those boxes. Every capture also waits on
`document.fonts.ready` plus a frame.

**A measurement is read in the container's own pixels, whatever scale the page
applies.** A site may zoom a figure with a CSS transform, as the lab website's viewer
does, and the browser then reports every client rectangle at the zoom's fraction of its
size. `html_helpers.local_rectangle` divides each rectangle by `screen_scale`, which is
the product of the `transform` and `scale` of the container and of its ancestors. The SVG
layers, the annotation layer, the rectangles of the fast display mode and the margin of
an inspection box are measured the same way. Through a scale, `unscale` snaps each length
to the browser's layout grid of sixty-fourths of a pixel, so a figure redrawn while
zoomed measures what the unscaled page measures. A measured width is the difference of
two fractional edges, so compare it with a declared width within a tolerance, as
`GlyphBox` does with `GROWTH_TOLERANCE`. `test/screen_scale.test.ts` holds the tests.

**The drawing overhangs its container** by `BUFFER` (10px) on each side, so
`getBoundingClientRect()` on `#diagram` is not the image bounds. `capture.contentBox`
measures the union over all descendants, skipping zero-area elements.
`HTMLDrawHandler` exports `BUFFER` for `inspectionBoxes.ts`, which leaves that room
around the first drawing of a box and measures the drawing with `contentBox` after it.

**Settings are merged over the defaults on every message**, not over the previous message's
settings, so each send fully determines the display. Partial settings are the design, not a
shortcut.

**A product is written by juxtaposition in both repositories.** `nm.Multiplication
.to_latex`, `NumericRenderer.product_string` and `pyncd` all write `3pq`, and each brackets
a factor that is a sum. A negative term carries one minus sign, placed from
`nm.is_negative` and written before `nm.without_sign` of the term, so neither repository
prints `1 + -x`, `a + -2 b` or `-2 -x`. `test/numeric_signs.test.ts` asserts the strings.
`product_string` adds brackets around the whole product because a shape label sets one
axis size beside the next.

**KaTeX has no `\mathbbm`, and `KATEX_OPTIONS` supplies it as a macro.** `nm.IsPositive`
prints the indicator `\mathbbm{1}_{x > 0}` in both repositories, so the command arrives
inside an `Arithmetic` name as well as from the renderer here. Every `katex.render` call
starts from `KATEX_OPTIONS`, and a label using a command the options do not define draws as
its own source in red.

**Decorators here are standard ES decorators**, not `experimentalDecorators` — `tsconfig
.json` leaves it off. A class decorator that takes `(cls)` and returns it works fine; one
that expects the legacy signature does not.

## Running things

```bash
npm run dev              # webpack-dev-server on :3000, opens a tab
npm run watch            # dev, and a production build into dist/ once edits settle
npm run build            # dist/ — this is what pyncd's headless path serves
npm run server           # the relay on :8765, in place of pyncd's run_server.py
npm run capture -- --output tmp/current.png # inspect the held diagram through the relay
npm run validate         # the tests and typechecks reached by the modified files, at once
npm run validate:all     # every test file and every typecheck, at once
npm run validate -- src/data_structure/Term.ts test/fixtures # what the named paths reach
npm run validate -- --plan # print the selection and run nothing
npm run typecheck        # tsc --noEmit, over everything the browser runs
npm run typecheck:server # tsc --noEmit, over the node entry points, the runner and their tests
npm run test:render      # every test file, and no typecheck
npm run test:diagram-theme # palette and light-mode compatibility regressions
npm run test:server-preview # capture protocol and failure handling
```

**`npm run validate` runs the checks reached by a change, and runs them at once.** The
runner, `test/validations/run_validations.ts`, treats as modified every path reported
by `git status`, or the paths named after `--`, and selects each test file and each
typecheck that depends on one of them. With a clean working tree and no path named, it
runs everything. An agent names its own modified files, so that the modifications of
others do not widen its run. The runner prints one line per selected target with the
modified files that reach it, and then lists the modified files that reach no target.
No validation checks those files. `--plan` prints the selection and runs nothing,
`--since REF` adds every path that differs from `REF`, and `--dependencies-of NAME`
prints the dependencies of a target. The selected test files run in one `node --test`
invocation, which runs each file in its own process, and each typecheck runs as its own
process beside it. The run exits non-zero when any of them failed, and prints each
failing test with its message and the line of the source it stands at.

A test file is found by the name `test/*.test.ts`, so a new test runs as soon as it
exists. A test depends on the modules imported by it at any depth and on the files read
by those modules. The runner finds a read from the static text of a path, such as
`new URL('./fixtures/x.json', import.meta.url)` or
`path.join(TEST_DIRECTORY, 'fixtures', name)`. A text naming a folder, or the start of a
file name, makes every file under it a dependency. A file read from outside the
repository is not seen. A typecheck depends on its `tsconfig`, on the files
named in the `tsconfig` and on every module imported by those files. A change to a test
file therefore does not select `tsconfig.json`, because `tsc -p tsconfig.json` reads no
test file. `package.json` and `package-lock.json` select every target.

The selection is one of the reasons the code is kept modular. A test that imports one
feature is not run when an unrelated feature changes, because none of its imports
imports that feature. A test of the arrow forms is not run when
`src/advanced_display/inspectionBoxes.ts` changes. A module that imports more than it
uses widens the run of every test that reaches it.

A test file included by `tsconfig.server.json` is a test of the node entry points, and
runs in a second invocation under node's own type stripping. `test/register_typescript.mjs`
transpiles any TypeScript and resolves an import written without its `.ts`, so under
that hook a node entry point would pass the test where node itself refuses to load it.
Every other test file runs under the hook. The runner is `test/validations/`, beside
the hook, because it imports nothing from `src/` and belongs to none of the layers.

**The hook keeps every module it transpiles in `node_modules/.cache/register_typescript/`.**
A stored module is keyed by its path, its text, the TypeScript version and the transpile
options, so an edited module is transpiled again and an unchanged one is read. Loading
`typescript` and transpiling the imports of a test took from two thirds to nine tenths
of the time of each test process, measured on 2026-09-27, and a test process whose
modules are all stored does not load `typescript` at all. Deleting the folder is safe,
and the next run fills it again. Each stored module carries an inline source map, and
the runner starts the tests with `--enable-source-maps`, so a failure names the line of
the TypeScript source rather than the line of the transpiled module. The runner also
typechecks with `--incremental`, keeping what `tsc` learned of each file in
`node_modules/.cache/typecheck/`, and `npm run typecheck` runs without it.

The page connects to `ws://localhost:8765` on load. Either `pyncd`'s `run_server.py` or
`npm run server` may be holding that port, and no client can tell which. A refresh
re-fetches whatever term the server is holding, so the usual loop is: leave the server and
the tab up, re-run the notebook cell.

**`npm run watch` keeps `dist/` current while the dev server runs.** `src/run_watch.ts`
starts the dev server and runs a production build as it starts. It builds again once
`src/` and `public/` have stayed unchanged for the settle period, which is 3000 ms and
which `--settle MS` replaces. A change to `webpack.config.js`, `tsconfig.json` or
`package-lock.json` restarts the dev server, because the dev server reads each of them
once as it starts. The dev server does not watch `dist/`, so a production build does not
reload the page. Node runs `src/run_watch.ts` directly, under the constraints the next
paragraph states.

**Node runs `src/run_server.ts` and `src/data_transfer/diagram_server.ts` directly**, with
no build step and nothing out of `dist/`. Type stripping accepts only erasable syntax, so
those two files and everything they import at run time must avoid enums and constructor
parameter properties, and must name every relative import with its `.ts` extension. They
are excluded from `tsconfig.json` and covered by `tsconfig.server.json` instead, because
they need `@types/node` and the browser configuration supplies no ambient types. Node
runs the validation runner under `test/validations/` in the same way, and
`tsconfig.server.json` covers the runner and `test/validation_selection.test.ts`.

**`npm run typecheck` and `npm run typecheck:server` are both clean.** There is no
baseline to allow for, so any error either of them reports is yours. `ts-loader` runs with
`transpileOnly: true`, so a type error stops neither `dev` nor `build`, and the typecheck
is the only thing that reports one. The list of pre-existing errors in
`test/validations/validation_targets.ts` is empty, so `npm run validate` fails on any
error either typecheck reports.

**`npm run validate:all` runs 316 tests in 34 files and both typechecks**, measured on
2026-10-01, and `npm run build` compiles with three webpack advisories about the size
of the bundle. Run `npm run validate -- <modified files>`, then inspect rendered images
in both themes.

## Things that will mislead you

- **Nothing in `src/` imports a `.json` file.** The figure the page boots with is
  fetched at run time, per *A page with no message of its own fetches the figure it
  boots with*, and `test/fixtures/` is read with `readFileSync`. An `import` of a
  12.5 MiB message writes it into the bundle and slows every build.
- **`defaultRenderHandlerSettings.debugBorders` is `true`**, so a figure drawn with no
  settings at all carries the element outlines. `pyncd`'s `display_settings` defaults the
  setting to `false` and the boot message carries that value, so neither a diagram sent
  from a notebook nor the boot figure shows them, and a figure that has them was sent
  `debugBorders: true`.
- **`StdRenderUpdate` in `websockets_transfer.ts` is dead.** `WebSocketClient` renders
  through the `RenderTarget`/`termPass` pair built in `index.ts`.
- **Reversal of a reindexing in the live path is the `reversed` *setting* plus
  `swap_anchors()`.** `DefaultStrideRendererSettings` sets the flag, so a reindexing is
  drawn with its codomain on the left. The backward pass is drawn by `ContravariantBox`
  mirroring its body, per *A mirrored region points its arrows and turns its tapes to
  the left*.
- **Commented-out code is everywhere**: an older `SubblockRender`, an earlier
  `_references_map` version of `ReferencesHandler`, `svgRenderHandler` imports and
  `highlight` variants. It records what the code used to be. Do not restore it.
- **`src/deepseek/`** holds DeepSeek-specific operators and boxes. Its `establish()` is
  never called; the module loads anyway because `display_deepseek.ts` imports it for the
  decorator arguments.
- **`pyncd`'s `headless.find_dist` looks for a sibling `tsncd/dist`**, unless `TSNCD_DIST`
  names another. A capture renders the last `npm run build`, and a notebook kernel holds
  its renderer until it exits, so a rebuild reaches a notebook after a kernel restart.
- **`dist/` is gitignored but present locally**, and is stale unless you rebuild. Headless
  captures render whatever was last built, not your working tree.
