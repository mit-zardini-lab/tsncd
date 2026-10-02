# The `pyncd` ↔ `tsncd` messaging framework

> **Mirrored document.** An identical copy lives as `Diagram Wire Format.md`, in the
> `backends` folder of `pyncd`'s `obsidian/` vault, alongside the Python documentation of
> the implementation. The protocol belongs to neither repository, so both carry it. Edit
> the two together, exactly as you would the two implementations. Only the links differ,
> each pointing at its own side.

`pyncd` builds the algebra and `tsncd` draws it. Neither can do the other's job, so
everything they share crosses a WebSocket as JSON. This document is the contract
between them.

These files implement it and must be changed together:

| | |
|---|---|
| Python client and server | [`websocket_transfer/websockets_transfer.py`](../pyncd/websocket_transfer/websockets_transfer.py) |
| TypeScript message types | [`src/data_transfer/diagram_protocol.ts`](src/data_transfer/diagram_protocol.ts) |
| TypeScript browser client | [`src/data_transfer/websockets_transfer.ts`](src/data_transfer/websockets_transfer.ts) |
| TypeScript server | [`src/data_transfer/diagram_server.ts`](src/data_transfer/diagram_server.ts) |

## Why there is a server in the middle

The obvious design — notebook talks to browser — is not available. A Jupyter
kernel cannot accept connections a browser can reach reliably, and neither end
has a stable lifetime: cells run and finish, tabs open and reload. So a third
process outlives both.

```
  ┌──────────────────┐   dataUpdate    ┌────────────┐   dataUpdate    ┌─────────────┐
  │ Jupyter kernel   │ ──────────────▶ │  DataServer│ ──────────────▶ │  Browser    │
  │ (DataClient)     │                 │ :8765      │                 │(DiagramClient)
  │                  │ ◀────────────── │            │ ◀────────────── │             │
  └──────────────────┘   renderResult  └────────────┘   renderResult  └─────────────┘
                                        holds the
                                        latest term
```

The server holds the most recent term, which is what makes a browser refresh
work: the page reconnects, identifies itself, and is sent the current diagram
without the notebook being involved. It is started once and left running.

Two implementations answer identically, and either may be the one that is up:

```bash
python run_server.py     # in pyncd
npm run server           # in tsncd, which is `node src/run_server.ts`
```

Only one of them may hold port 8765 at a time. The node server binds `127.0.0.1`
and `::1` separately, because `localhost` resolves to either and node's `listen`
takes one address where Python's `websockets.serve` takes every address the name
resolves to. The choice is otherwise a matter of which runtime is already
installed. The node server relays large frames far faster, as
[Where the time in a capture goes](#where-the-time-in-a-capture-goes) measures.

**Clients are asymmetric.** A `DataClient` (a notebook) connects per send and
disconnects. A `DiagramClient` (a browser tab) stays connected for as long as
the tab is open. There may be several diagram clients at once; they all display
the same thing.

## Messages

Every message is a JSON object with a `msgType`. Unrecognised types raise on the
server — deliberately, so a version skew between the two repositories fails
loudly rather than silently dropping diagrams.

### `identify` — client → server

First message on every connection. Until it arrives the server does not know
which way information should flow.

```jsonc
{
  "msgType": "identify",
  "clientType": "DataClient" | "DiagramClient",
  "clientVersion": "0.1.0",
  "clientID": "unique-client-id-1234"
}
```

Answered with `{"msgType": "Connected"}`. If a `DiagramClient` identifies while
the server is holding a term, that term is pushed immediately — this is the
refresh path.

### `dataUpdate` — either direction

A term to display. Sent by a notebook; relayed by the server to every diagram
client. The term is a morphism, or a `DefinedExpression` holding two morphisms, which
the client draws as its left-hand side, `:=` and its right-hand side in one row, each
side wrapped at half of `width`.

```jsonc
{
  "msgType": "dataUpdate",
  "data": "{\"uid_repository\": …, \"data\": …}",   // note: a JSON *string*
  "settings": {
    "darkMode": true, "blockBackground": "subtle", "blockHoverIntensity": 0.12,
    "debugBorders": false, "coreDebug": false,
    "width": 750, "subBlocks": true, "drawnBlockTags": [],
    "tapeLabels": true, "legend": false, "inspectionBoxes": false,
    "axisHover": "legend", "axisLabelFontSize": 0.8,
    "title": "DeepSeekV4.1", "heading": "none"
  },
  "auxiliary": { "legend": [ … ], "naturals": [ … ], "blocks": { … },
                 "expansions": { … } }
}
```

`data` is doubly encoded — a JSON string inside a JSON object — because
`TermJSONConverter.export_to_json` returns serialised text and it is passed
through without re-parsing. The TypeScript side calls `JSON.parse` on it a
second time.

`settings` is **partial by design**. The client merges whatever arrives over its
own defaults from
[`RenderHandlerSettings.ts`](src/display/Render/RenderHandlerSettings.ts),
so an omitted key takes its default rather than whatever the previous send left
behind. Every send therefore fully determines the display. On the Python side,
[`send_morphism.display_settings`](../pyncd/websocket_transfer/send_morphism.py)
is what assembles the partial dict.

`darkMode` defaults to `true`. The dark theme uses a charcoal canvas with light
text, wires and glyph outlines. Enclosing regions have dotted outlines and
faint background tints. Operator surfaces are dark and drop shadows are disabled.
Colored strokes and labels retain their hue with enough lightness for the dark
canvas. `darkMode: false` restores the light theme's colors, fills and shadows.
Python theme arguments default to `None`, which omits `darkMode` and defers
to the renderer's default. `ColorMode.DARK` and `ColorMode.LIGHT` from
`websocket_transfer.websockets_transfer` select explicit modes. The Python
settings helper converts those enum members to `true` and `false` on the
wire. Existing boolean calls remain supported. Notebook
`DiagramSettings.dark_mode` accepts the same enum and defaults to `None`.

The theme adapts drawing and annotation attributes in the render backend.
Both themes use the same geometry and element update methods. Each render
target owns its theme, so a capture can use a different mode from the display.
An omitted `darkMode` takes the default on every message.

`blockBackground` controls dark-mode enclosure fills. Its levels are `none`,
`subtle`, `medium` and `strong`. The default is `subtle`, which blends 4.5% of
the block's color into the canvas color. `medium` uses 8% and `strong` uses 14%.
Light mode retains its existing enclosure fills.

`blockHoverIntensity` controls the tint applied to a highlighted block and its
associated BlockOperator. The default is `0.12`, and values from `0` to `1`
blend the surface toward the shared highlight color. Both elements use the
same resolved fill. These optional keys can be supplied in the Python
`RenderHandlerSettings` dictionary passed to `send_term` or `render_term`.

`debugBorders` (default `true`) paints a one pixel outline around every
materialised element that was given a border colour, which shows the boxes an
expression is built from. `HTMLRenderHandler.applyAux` reads it. The renderer's
own default is `true`, and `display_settings` on the Python side defaults it to
`false`, so the page draws its outlines before any message arrives and a diagram
sent from a notebook carries none. `coreDebug` (default `false`) paints the same
outline on core elements alone.

`width` is a layout setting among the rendering ones. It is the px at which a
morphism wraps onto another line so that `F₀; F₁ = F`. It therefore controls the
figure's **proportions** and leaves its scale alone. A narrower width gives more
rows and a taller figure, and a wider one gives fewer rows and a flatter figure.
It travels in the settings because those are what reaches the renderer on every
send.

The figures below were measured on the transformer:

| `width` | page | aspect |
|---|---|---|
| 750 (default) | 9.4 × 6.6 in | 1.43 |
| 1000 | 12.0 × 5.8 in | 2.09 |
| 1400 | 16.2 × 4.9 in | 3.29 |
| 2000+ | 17.3 × 4.3 in | 4.03 (unwrapped; no further effect) |

`subBlocks` (default `true`) is whether the bodies of `BlockOperator`s are
drawn as sub-diagrams beside the main figure. A figure export that wants the
high-level view alone — and each box's body as its own figure — sends `false`.

`drawnBlockTags` (default `[]`) names the `BlockTag`s whose bodies an earlier
send already drew, each as the `uid._id` of its tag, which is the integer the
JSON carries on the tag's `uid`. The client leaves out a pending body whose tag
is named and still draws the box in the main figure, and it does not descend
into a body it left out, so a `BlockOperator` nested inside one is not drawn
either. The sender keeps the record, because the client wipes its render target
at the start of every message and a capture draws into a second target that
never saw the first. `pyncd`'s
`notebooks/display/remember_drawn_blocks.py` keeps it for the life of a
notebook kernel, and `notebook_diagrams.forget_drawn_blocks()` empties it.

`tapeLabels` (default `true`) labels each tape with the slot it reaches, set
at the free end of the tape. A tape belongs to a `ParaWrap` - the display form
`para.data_structure.ParaWrap.to_para_wrap` puts a `Para` into before sending,
with each grab or drop written onto the morphism it touches; a bare `Grab` or
`Drop` is drawn as the wrap over an identity. A grab and the drop that filled it
are the same parameter, but they are drawn in different rows with no line
between them, so the label is the only thing that pairs them. The label is the
slot's name where the term carries one, and `para.new_slot` names them
`s0, s1, …` in creation order. Where the term carries no name the label is two
hex digits of the slot's UID, and the hue of the label comes off that UID. Send
`false` for a figure with one tape, where there is no pairing to show, or where
the labels crowd a narrow row. They are drawn outside the layout, as the tapes
themselves are, and so over the row above or below.

A taped array answers the pointer over the strip between its first and last
tape, from the arrowheads down to the row the tapes reach, and not over the slot
name beside them. Resting the pointer there paints a plate behind that strip in
the slot's colour and lights the halos of every grab and drop of the same slot.
Beside each of the plates so lit an open padlock is drawn, in the slot's own
colour, outside the edge of the plate the arrowheads are on and at the end of
that edge nearest the slot name. Clicking a plate locks the slot: its plates and
halos stay lit once the pointer has left, and the open padlock beside each of
them closes. Clicking a second time releases the slot, and several slots may be
locked at once. A lock is a highlight source of its own, so the pointer's hover
comes and goes beneath it, and a slot locked in a figure is lit in the diagram
inside every inspection box that figure opens. The click stops at the plate, so
it opens, locks and closes no inspection box. Drawing the figure again releases
every lock, so a capture of a figure nothing has pointed at carries neither a
plate nor a padlock.

`axisHover` (default `legend`) says where an axis answers the pointer. Under
`legend`, resting the pointer on the axis's row of the legend halos every wire
of that axis in the figure and glows every name of it, and the wires and names
answer no pointer. Under `everywhere`, resting it on a wire, or on the name of
the axis in a gap or on a tape, lights the same and shades the legend row.
Under `off`, no halo is drawn and nothing answers. The axis is identified by
its uid, so two axes that happen to share a name do not light together. A halo
is a glow in the theme's highlight colour, a blue in each theme, whatever the
colour of the wire or the name it surrounds.

`axisLabelFontSize` (default `0.8`) is the size, in em, of the label an axis
carries on its wire, which is the name and the size drawn in a composed gap, at
the ends of a row and along a tape. The label is measured at the size it is
drawn at, so a figure asking for a larger label is laid out with the room that
label needs. The setting reaches the drawing through
`axis_label_font_size` in
[`RenderHandlerSettings.ts`](src/display/Render/RenderHandlerSettings.ts), and
no other label reads it: an operator's name, a block's title, a tape's slot
label, a datatype's label and the strides of a reindexing keep their own sizes.

`form` (default `all-broadcasted`) says which of three forms the figure is drawn
in. Under `all-broadcasted` every array is drawn as one wire for each of its
axes and every operator with its glyph, its contraction cups, its reindexing
node and the wires of the axes it is broadcast over routed around the glyph,
as every figure was drawn before the setting existed. Under
`arrows-and-broadcasted` each array that passes from one operator to another
is drawn as one wire, an arrow stroked heavier than an axis wire, with a
triangle on it pointing from the operator that writes the array to the
operator that reads it, and labelled in two lines. The shape of the array
stands above the arrow, its axes in square brackets separated by commas, in
the order of the axis wires from top to bottom. The datatype stands below the
arrow, which is the array's quantisation where the array carries one and
`\mathbb{R}` otherwise, so every arrow states the format its array is held
in. A matrix of reals over `q` and `d` reads `[q, d]` above its arrow and
`\mathbb{R}` below it, a scalar of reals writes no shape and `\mathbb{R}`
below its arrow, an array of naturals along `x` bounded by `\bar{v}` reads
`[x]` over `\bar{v}`, because the bound is what a wire of that datatype is
labelled with, and an array held in FP32 reads `\mathtt{FP32}` below its
arrow. The user asked for the commas and for the datatype below the arrow on
2026-09-26. The client writes the datatype the array carries and infers no
quantisation from a neighbouring cast. Every operator is drawn under this form
as it is under `all-broadcasted`, and it stands on a plate, a rounded rectangle
with a drop shadow drawn under it in the theme's surface tint. The whole plate
answers the pointer for the operator's inspection box, as the box of the boxed
form does. A conversion drawn thin, which is a `TypeConvert` carrying no name,
stands on an empty plate, and the datatype below the arrow of its result is
written in the thin cast's blue and opens the same box. At the left edge of the
plate the arrow of each operand opens into one wire for each of its axes, and
at the right edge the wires of each result close into the result's arrow.
Each axis wire is named where it enters and where it leaves the plate, as it
is named in a gap under `all-broadcasted`. The plate carries a name in small
type above the glyph. The name says what the operator does where the
operator's class registers one. It is `Linear` for a `Linear`, `Cache` for a
cache, and for an `Einops` the name read off its signature, as the boxed form
below names its box. Every other plate carries its operator's own name. A
name the glyph writes already is left off. An elementwise map with one
operand and one
result gets no plate: its arrow runs straight through and its name stands
over the arrow between two small heads. A `BlockOperator`, whose glyph is a
titled box already, gets no plate. Under `arrows-and-boxes` the arrays are
the same arrows, and every operator is a box with one arrow entering per
operand and one leaving per result, faced by what the operator is: its name
in the middle of the box for most operators and for an elementwise map, a
name read off the signature for an `Einops`, which is `Matmul` for two
operands with a contracted group, `Sum` for one operand with a contracted
group, `Product` for two or more operands with none and `Contraction`
otherwise, the glyph drawn small inside a labelled box for a softmax and the
normalisations, the named rectangle of a `Linear`, the name of the reindexing
of a `View`, and the titled box of a `BlockOperator`. Each box carries above
it the name carried by the plate of `arrows-and-broadcasted`, in the same
small type, and leaves the name off where the face writes it already. A
`Linear` therefore reads `Linear` above the rectangle naming its weight, and
a cache reads `Cache` above the box naming the cache. `Matmul` is written
once, inside its box. Nothing of the
broadcasting is drawn in this form. In both arrow forms an operator that a
grab or a drop is written onto keeps the taped array in its column, and the
tape comes down from its free end, turns a corner and runs level into the
array's arrow, or leaves the arrow level and turns down. A `Contravariant` is
drawn as its body mirrored, and the data of the backward pass it holds travels
from right to left. In the backward pass every triangle on an arrow or on a
datatype wire, the two heads of an elementwise map in every form and the head a
dangling natural wire ends in point left. A grab's tape in the backward pass
comes down from above and turns left into its arrow, and a drop's tape leaves its
arrow to the left and turns down, with the slot name right of the arrowhead. The
user asked for the arrows and the tapes of a reversed category to be drawn so on
2026-09-27. The arrow's label
stands on that level stretch as it stands on any other arrow, so no label
runs down a tape. A bare grab's tape writes no label, because the gap after
it labels the arrow the tape turns into. Only the wires between operators and
what stands at each operator differ between the three forms. A reader meets
the boxed form first. The all-broadcasted form is the full form, which shows
what each operator does with each axis. The client draws the all-broadcasted
form for a message with no `form` key, so a figure sent without the key is
drawn as it was before the setting existed. `DiagramSettings.form` carries
the choice from a notebook as a `wst.DiagramForm`.

`controls` (default `hidden`) says whether the page draws, under its heading
and outside the diagram container, one row of controls: the selector of
variants on a page carrying several, then the buttons that switch its form and
its theme, then a box holding the wrap width and the buttons of the sizing,
which *A page that switches its form and its theme* describes.
Under `hidden` the whole row is hidden, the selector with it. A notebook sends
`shown` unless `DiagramSettings.controls` says `HIDDEN`, and a captured image
holds no button either way.

The default suits a screen. A figure spanning a paper's text block usually
wants 1000–1400.

`dynamicMultilineSizing` (default `true` since 2026-10-01) says how a figure
wider than `width` is divided into rows. Under `false` each row is filled until
the width runs out, and the block open at that point is cut at whatever depth
it has. Under `true` the rows are planned by dynamic programming over the leaves of the
figure's blocks, with `width` as the target of each row, and a row may run over
the width by 15% to keep a block whole. A break between two whole blocks costs
nothing, a break inside a block costs more the deeper and the more repeated the
block, a break inside a block that fits on a row of its own costs most, a piece
of a cut block narrower than a third of it costs a great deal, and every row
pays for the square of its shortfall from the width, so the rows come out of
similar width. `src/display/Framework/dynamicMultilineSizing.ts` states the
costs. A notebook sends the setting for `DiagramSettings.multiline_sizing`,
`false` for `MultilineSizing.FIXED` and `true` for `DYNAMIC`.

`legend` (default `false`) draws a table of the term's axes beside the figure.
Each row carries the axis, the integer its size comes to and the code name the
axis was written with. The rows themselves arrive in the `auxiliary` field, and
the table is appended inside the diagram container, so an image cut from that
container holds it. The axis column is written by the client rather than taken
from the row's `latex`: each of the axes a row names by uid is labelled by the
`AxisProcessor` registered for its class, which also labels that axis's wire,
so a row reads exactly as the wires it stands for, and a row whose axes come out
under two labels is drawn as one line per label. The row's `latex` is the
fallback where no axis of the term carries one of its uids.

A row is linked to the wires of its axes as `axisHover` says: resting the
pointer on the row halos those wires, and under `everywhere` resting it on one
of them, or on the axis's name, shades the row. Clicking a row locks the halo
on and shows a closed padlock beside it, and clicking it again releases it.
Several rows may be locked at once, and a lock reaches the diagram inside an
open inspection box as well as the figure. The click does not close the
inspection boxes, although the table sits inside the diagram container.

Where the `auxiliary` field carries `naturals`, a second table stands under the
first, with the columns `natural`, `size` and `code name`, one row per
`cat.Natural` that is the datatype of an array of the term. A natural has no
uid, so a row carries the key of the natural's bound. The client writes the
natural column with the label the figure draws on the wire of a natural of the
term with that key, and with the row's `latex` where the term holds none. A row
answers the pointer as a row of axes does. Resting the pointer on it halos every
wire whose datatype is a natural with that key, or holds one as a quantisation
holds the natural it wraps, and glows the label of each such wire. A click locks
the halo on, a second click releases it, and the lock reaches the diagram inside
an open inspection box. Under `everywhere`, resting the pointer on such a wire or
its label shades the row. The wires answer in all three forms: the arrow of a
natural array and the branch of a fan that reaches a natural's wire light with
the row. One note under the two tables says that a click locks a row. The user
asked for the second table on 2026-09-27.

`inspectionBoxes` (default `false`) lets a block, or an operator the sender
writes an expansion for, open a box when the pointer rests on it. The box shows
the title, the formula, the description and the links the sender supplied, and
under them the block's body or the operator's expansion drawn as a diagram of
its own. A block drawn as `BODY_IN_PLACE` is the one box with no diagram under
its text, because its body is already drawn where the block stands. The
blocks and operators drawn inside a box open boxes of their own, whether or not
the box is locked, so a reader opens one operator inside another, and the block
a box was opened from is highlighted while the box is open. Clicking locks a
box open. Several boxes may be locked at once, one per block or operator, and
each holds the boxes opened inside it.
Clicking the page outside every box closes them all, as does the escape key.
A box is a core width of 1000 pixels with a padding of 14 either side of it,
which `src/advanced_display/boxWidths.ts` holds, so a box is 1030 pixels wide
with the same padding either side of its text. A box taller than the window
scrolls, and a browser draws the scrollbar of a box inside the box, where it
takes room from the content, so a box showing a scrollbar is laid out that much
wider again, 1045 pixels where the scrollbar takes fifteen. The text of a box
occupies the core width either way, and the scrollbar stands beside the text
rather than over it. The diagram inside a box
is wrapped so that the drawing and the ink that overhangs it together occupy the
core width: the wires and the labels reach past the drawing's container, the
overhang is given to the container as its margin, and the term is drawn again
narrower where the first drawing came out wider than the core. A window with no
room for 1030 pixels holds a box of the room it has, less an eight-pixel margin
either side. What each box shows arrives in the `auxiliary` field.

Where the record of a block or an expansion lists `indices`, the box draws a
second line directly under the formula, centred and set at the size of the
formula, which reads `\forall i_{x} \in x,\; j_{d} \in d` with one clause for
each index. Each clause answers the pointer. Resting the pointer on the clause
`i_{x} \in x` shows a tooltip reading "The axis $x$ carries a set of indexes,
in $[0, \lvert x \rvert)$.", with the axis and the interval typeset. A tap or a
click on a clause shows or hides the tooltip, so a phone reaches it, and the
click neither locks nor closes the box. The tooltip is drawn in the colours of
the box, stands over the page inside the screen and changes nothing of the
layout of the box. It is hidden when the page or the box scrolls and when the
box closes. The user asked for the line on 2026-09-27.

`title` (no default) names what the page shows. The name of the tab reads
`tsncd - <title>`, so a message sent with `"title": "DeepSeekV4.1"` names the
tab `tsncd - DeepSeekV4.1`, and a message that sends no title returns it to
`tsncd`, because the settings of each message are merged over the defaults.

`heading` (default `none`) says whether the same text is written as a heading
over the figure. Under `none` the page holds the figure alone, so it stands as
a page of a site that writes its own heading above it. Under `title` the
heading reads what the tab reads. Only the display target writes the tab and
the heading. An off-screen capture and the diagram inside an inspection box
draw with the same settings and leave both as they were. A captured image holds
the diagram alone, so neither appears in one.
[`pageHeading.ts`](src/display/pageHeading.ts) writes both, and `pyncd` sends
the settings with `display_settings(title=..., heading=...)`, which a notebook
sets as `DiagramSettings.title` and `DiagramSettings.heading`.

### A page that carries its own message

A `dataUpdate` may be written into the page in place of being sent to it. The
page then holds a `script` element of type `application/json` with the id
`tsncd-embedded-message`, whose text is the message as the server would relay
it, with `data`, `settings` and `auxiliary`. The entry point looks for the
element once its registries are established. Where it finds one, it draws the
message through the `termPass` the socket uses and opens no websocket, so a
server on port 8765 cannot replace the figure. Where it finds none, it connects
as before and draws the figure the build carries, which
[The figure a page boots with](#the-figure-a-page-boots-with) states.
[`embedded_message.ts`](src/data_transfer/embedded_message.ts) reads the
element.

[`standalone_page.py`](../pyncd/websocket_transfer/standalone_page.py)
writes such a page as one HTML file. It takes the built `index.html`, removes
the element that loads the bundle from `assets/`, and writes the message and the
bundle into two `script` elements at the end of the body. The `<` of every
`<!--`, `<script` and `</script` in the bundle is written as the JavaScript
escape `\x3C`, and every `<` of the message as the JSON escape
`\u003c`, which is what the HTML standard recommends for text inside a
`script` element. The file opens from `file://` with no server and no network,
and its legend and inspection boxes answer the pointer, because the page runs
the same bundle on the same message. A 2.6 MiB file holds the whole
DeepSeek-V4.1-Flash model, of which the bundle is 0.94 MiB. A notebook writes
one with `DiagramMode.HTML`.

The page is painted in the canvas colour of its theme by its own
stylesheet, before the bundle runs, and shows a turning ring in the element
`page-loading` until its figure is drawn. Once the message is read, and before
its term is built, [`loadingScreen.ts`](src/display/loadingScreen.ts) repaints
the page in the theme of the message, so a light figure arrives on a light page
and no white page stands where a dark figure is about to. The first draw
removes the ring, and a page whose figure cannot be drawn writes the reason
where the ring stood. A page with no message of its own shows the ring while
it fetches the figure it boots with.

The theme a page is painted in before its bundle runs is chosen by a script at
the top of its head, by the rule the bundle follows: the query parameter
`darkMode`, then the theme the system asks for through `prefers-color-scheme`,
and dark where the browser answers no media query. `standalone_page.py` still
writes the element `<meta name="tsncd-dark-mode" content="false">` at the
start of the head of a page whose message sets `darkMode`. Since the user's
ruling of 2026-09-27 neither the script nor the bundle reads that element, or
`tsncd-dark-mode` in `localStorage`. A light page is marked
`data-tsncd-theme="light"` on its root and painted light from its first frame,
so no dark frame shows before the message is read, which the user reported on
2026-09-26.

Such a page may carry a second element, of type `application/json` with the id
`tsncd-localisations`, written directly after the message and before the
bundle. It holds one localisation per wording:

```jsonc
{
  "default": "English",
  "localisations": {
    "English": {"blocks": {}, "expansions": {}},
    "日本語": {
      "blocks": {"10175062": "隠れ軸に沿った RMSNorm を伴う線形写像。"},
      "expansions": {
        "7": {
          "description": "重み付きオンラインソフトマックス。",
          "auxiliary": {"blocks": {…}, "expansions": {…}}
        }
      }
    }
  }
}
```

A localisation is the difference from the exported wording, so it lists only
the descriptions that differ from the ones in `auxiliary`. Its `blocks` are
keyed by the uid of a block's tag and its `expansions` by the importer number,
the same keys as `auxiliary`, and the `auxiliary` of an expansion carries the
descriptions of the blocks and the operators inside that expansion. The entry
named by `default` is the exported wording and normally lists nothing. The keys
of `localisations` are drawn in their order, as one button per wording beside
the heading of the page, where two or more wordings are carried. The chosen
wording is held in `localStorage` under `tsncd-localisation` and applied when
the page is opened again.

A localisation changes descriptions alone. A title and a formula are drawn in
the figure as well as in an inspection box, and the title of a block sets the
width and the height the block is drawn at, so a wording that changed one would
lay the figure out again. Clicking a button therefore writes the descriptions
onto the auxiliary information of the rendered figure and writes the text of
every open box again, and the figure itself is not drawn a second time. A box
locked open by a reader stays open, in its place, in the new wording.
[`embedded_localisations.ts`](src/data_transfer/embedded_localisations.ts) reads
the element,
[`localisedDescriptions.ts`](src/advanced_display/localisedDescriptions.ts)
writes a wording onto the auxiliary information, and
[`localisationSelector.ts`](src/advanced_display/localisationSelector.ts) draws
the buttons. A driving browser switches the wording with
`window.tsncd.localise('日本語')`.

### A page that carries several variants

A page may carry several variants of one model in place of one message, such
as the model at the quantisations of its released checkpoint beside the same
model in the reals, or the model decoding a token with no cache beside the
model decoding it from a cache. Such a page holds one `script` element of type
`application/json` with the id `tsncd-variants`, and no
`tsncd-embedded-message` element. Its text is an `EmbeddedVariants`:

```json
{
  "version": 1,
  "settings": {"form": "all-broadcasted", "darkMode": false, "width": 900},
  "initial": "decode-quantised",
  "groups": [{"id": "decode", "title": "Decode"}, {"id": "cached", "title": "Cached"}],
  "variants": [
    {"id": "decode-quantised", "group": "decode", "title": "Quantised",
     "detail": "FP8 weights and BF16 activations, as the released checkpoint runs",
     "message": 17},
    {"id": "decode-unquantised", "group": "decode", "title": "Unquantised",
     "detail": "The same model in the reals",
     "derivedFrom": "decode-quantised", "functor": "dequantise"},
    {"id": "cached-unquantised", "group": "cached", "title": "Unquantised",
     "detail": "The model reading its keys and values from a cache", "message": 23}
  ],
  "value_repository": [[0, "msgType"], [0, "dataUpdate"]]
}
```

`value_repository` is one repository in the form stated under
[COMPRESSED exports share JSON values by content](#compressed-exports-share-json-values-by-content).
A variant drawn from a term of its own names by `message` the root of its
`dataUpdate` in that repository. The root decodes to
`{msgType, data, settings, auxiliary}`, and its `data` is the term in the
`uid_references` form written as a JSON object, where a relayed message writes
it as text. Every message of the page is compressed into the one repository,
so a record held by two variants, such as an axis, a weight or a box whose
body both of them draw, is written once. The page decodes only the records the
variant it draws reaches, and keeps them, so a second variant reuses the
records it shares with the first. The `expansion` of an operator's record may
likewise be the term document itself rather than its text. A variant derived
in the browser names by `derivedFrom` a variant carrying a message, and by
`functor` the functor tsncd applies to the term of that variant. Its
`settings`, where present, are merged over the settings of that variant, and
its `auxiliary`, where present, is a root replacing the auxiliary information
derived by the functor. `groups` lists the groups in the order the selector
draws them, each variant names its group by `group`, and `detail` is the line
written under the title of a variant in the selector. The query parameter
`displayMode` applies to the settings of every variant, as it applies to a
page's own message. An element holding no variant is read as no element, and
an element whose facts do not hold, such as a derivation from a variant
carrying no message, is refused with the reason written where the ring stood.

`settings` repeats the settings of the initial variant uncompressed, with `form`
and `darkMode` written first and stated even where they take tsncd's defaults.
The build plugin of the lab website, `_plugins/diagrams.rb`, parses the element
as JSON and reads its groups, its variants and its initial variant, and the form
and the theme the initial variant was written with from `settings`. It builds a
page of the site for every variant, so a link naming a variant the page does not
hold has no page. Before 2026-09-27 the plugin read the two keys from the text
of the file with regular expressions, which is why `standalone_page.py` still
writes `form` and `darkMode` first, with a space after each colon and comma, and
writes the repository with none. Every `<` of the element is written as
`\u003c`, and the head states the theme of the initial variant as it states the
theme of a page with one message, in an element tsncd no longer reads. The page
opens in the form and the theme its address names, and in the all-broadcasted
form and the system's theme where the address names none, so the lab website
names both in the address of its frame.

One functor is defined, `dequantise`, in the three steps the user set out on
2026-09-27. It replaces every `Quantified` datatype, on every wire and every
weight, by the datatype it wraps, so the `BlockScale` it carries goes with it.
It turns into the identity on its operand every `TypeConvert` that then reads
and writes one datatype, inside the body of every box and of every `ParaWrap`
as well, and a conversion that still converts stays. It then removes the
identities from the leaves upwards: a composition drops each identity and
becomes the identity when every member is one, a
product of identities is the identity, and a block or a box whose body is the
identity is the identity, whatever its tag, repetition, title or colour. A
figure drawn with inspection boxes wraps every cast in a `BlockOperator` whose
block is drawn `BODY_IN_PLACE`, and that box goes with its cast by the last
rule. A `ParaWrap` that grabs or drops acts on the tape, so a cast whose
operand is grabbed or whose result is dropped, which a figure drawing the tape
on the ports of an operation holds as the body of a `ParaWrap`, leaves the wrap
holding the identity. The identities are those of the category of arrays, so a
reindexing, which is a morphism of the category of axes, is left as it stands.
[`strip_quantisations.ts`](src/quantization/algebra/strip_quantisations.ts)
states the functor in tsncd, and
[`quantization/algebra/strip_quantisations.py`](../pyncd/quantization/algebra/strip_quantisations.py)
states it in Python, with the removal of identities in
[`algebra/remove_identities.py`](../pyncd/algebra/remove_identities.py).

The quantisation pass gives a box a tag of its own for every quantised body it
holds, so blocks the functor made equal again carry several tags. tsncd keys a
block's highlight, its inspection box and its sub-diagram by its tag, so after
the functor
[`share_block_tags.ts`](src/data_structure_processing/share_block_tags.ts)
gives every block whose body, repetition, aesthetics and display order equal
those of a block met before it, in a depth-first walk of the fields, that
block's tag, and each body is drawn once. The quantised DeepSeek-V4.1-Flash
carries 1209 tags, and its derived variant carries 211. A derived variant's
operations keep the importer numbers of its source's operations, so an
`auxiliary` given for a derived variant is keyed by the numbering of the
source's message. tsncd carries an `auxiliary` given for a derived variant
across the functor as it carries the source's, so the records of what the
functor removed are dropped and every expansion is marked with the functor.
The settings of a derived variant may therefore change the text of its
inspection boxes as well as its display settings.
`notebook_diagrams.show_page_variants` writes an `auxiliary` for a derived
variant whose settings differ from its source's in the roles of the operators,
the explanations of the operators or of the reindexings, the references of the
operators, the base of the code links or the parameters an expansion draws. It
is written for the morphism the source's message exports, and every block
explaining an operator or a reindexing keeps its tag and takes the text the
tables of the derived variant give it. A derived variant whose settings differ
in none of these carries none. The auxiliary of the unquantised variant of
GLM-5.3, whose weights take roles naming no quantisation, adds 52 records to
the repository. The auxiliary information the functor derives keeps the
legend, keeps the records of the blocks and the operations the derived term
still holds, and drops the rest, so a removed cast takes its record with it.
Each operator record it keeps is marked with the functor, and the inspection
box applies the functor to the expansion's term and its own auxiliary
information before drawing it, so an operator opened in the derived figure
shows its expansion in the reals.
[`derivedFigures.ts`](src/advanced_display/derivedFigures.ts) applies the
functor to a figure.

tsncd draws the initial variant and, as the first group of the row of controls
under the heading, a selector listing every group with its variants. The
buttons of the form and the theme follow the selector in the row, the row
wraps where the window is narrower than it, and the row is hidden, the
selector with it, where `controls` is `hidden`. The lab website embeds a page
with `controls=hidden` and draws a toolbar of its own, whose selector of
variants the page's `tsncd-state` messages fill. Before 2026-09-27 the
selector stood above the row and was drawn whatever `controls` said. A page
carrying one variant draws it and no selector, and offers no variant for
choice. The selector follows the lab website's `diagram-viewer.html`. Its
summary names the group, in small capitals, and the title of the variant on
display, beside a triangle that turns while the panel is open. The panel lists
each group under a small uppercase label, every variant as its title with its
`detail` beneath, and marks the variant on display with the accent colour and
a bar on its left edge. The selector is drawn in the theme of each draw. It
closes on the escape key, which returns the focus to its summary, on a click
outside it, and when the window loses the focus, and a click inside it is
stopped there, so it closes no inspection box. Each option is a link to the
page's address naming its variant and the form and the theme on display,
written again after every draw, so a click with a modifier opens the variant
in a page of its own in the form and the theme the reader sees.

A variant is chosen from the selector, from the query parameter `variant` of
the page's address, from a `{type: 'tsncd-display', variant}` message posted
to the window, or by `window.tsncd.variant(id)`, which resolves once the
variant is drawn and rejects an id the page does not offer. The address and
the message are checked strictly, per *A page that reads its address strictly
and reports its state to a host*. `window.tsncd.variants()` lists the variants
as `{id, group, title}`, `window.tsncd.currentVariant()` names the one drawn,
and `window.tsncd.variantTimings()` lists how long each step of building a
variant took, in milliseconds, as `{variant, step, milliseconds}` with the
step `decode`, `import` or `functor`. A variant is drawn in the form and the
theme of the figure on display, so a reader's choice of either holds from one
variant to the next. A request that names a form or a theme with the variant
has the variant drawn in them, in one draw. A variant asked for while another
is being prepared replaces it, the variant asked for last is drawn, and a form
or a theme named with a replaced request is kept for that draw. A variant is
built the first time it is asked for and kept, so a return to it draws the
kept term.

The element `page-loading` stands over the page, in its canvas colour, while a
variant is prepared, with a line of text under the ring. It reads
`Loading <group>, <title>…` while the records of a variant are decoded and its
term imported, `Applying Dequantization Functor...` while the functor runs,
and `Drawing <group>, <title>…` before the variant is drawn, and it is removed
once the variant is drawn. Each line is painted before the work it names
starts. In a headless Chromium the functor took 76 to 80 milliseconds on
GLM-5.3 and 335 to 374 milliseconds on DeepSeek-V4.1-Flash, and drawing a kept
variant again took 0.4 and 3.0 seconds.
[`embedded_variants.ts`](src/data_transfer/embedded_variants.ts) reads the
element,
[`variantFigures.ts`](src/advanced_display/variantFigures.ts) builds each
variant, and
[`variantSelector.ts`](src/advanced_display/variantSelector.ts) draws the
selector and holds the switch.

`websocket_transfer/standalone_page.py` writes the page with
`save_page_with_variants`, and a notebook writes it with
`notebook_diagrams.show_page_variants` under `DiagramMode.HTML`.
`websocket_transfer/validate_page_variants.py` checks the element without a
browser, and `test/variant_pages.test.ts` and
`test/strip_quantisations.test.ts` check the reader, the switch and the
functor. The user asked for the variants on 2026-09-27, for the model pages of
the lab website.

### A page that switches its form and its theme

A page holds one term and draws it in any of the three forms and either theme
without loading anything again. A switch redraws the term the page holds in
memory through the same `termPass`, with the one setting changed, repaints the
page in the theme's canvas colour, keeps the heading and the localisation
selector, and drops the pooled inspection content of the previous draw. The
legend and the inspection boxes are drawn again from the same auxiliary
information, because a block is keyed by its tag and an operator by its
number, which no form changes. The switch reaches the page three ways.

- The row of controls under the heading, drawn where the message says
  `controls: shown`: the selector of variants on a page carrying several, one
  group naming the three forms, one naming the two themes, with the current
  choice marked, and a box holding the wrap width the figure was drawn at.
- The address of the page. The query parameters `form`, `darkMode` (`true` or
  `false`) and `controls` (`shown` or `hidden`) set the form, the theme and
  the controls of the page's own figure, as `displayMode` sets its mode, so a
  host page holding the figure in an iframe sets the form and the theme in the
  iframe's address. Any other value refuses the address, and the page draws
  nothing.
- A driving script. `window.tsncd.display({variant, form, darkMode})` switches
  any of the three and returns a promise settled once the figure is drawn,
  which rejects, having changed nothing, for a choice the page refuses. A host
  page posts `{type: 'tsncd-display', variant, form, darkMode}` to the
  iframe's window with `postMessage`, which the page answers by the same
  switch and then with a `tsncd-state` message, or with a `tsncd-refused`
  message.

The address alone decides the form and the theme the page's own figure opens
in, as the user ruled on 2026-09-27. Where it names no `form` the figure opens
in the all-broadcasted form, and where it names no `darkMode` it opens in the
theme the system asks for through `prefers-color-scheme`, whatever form and
theme the message was written with. The rule holds for a page with variants, a
page with one message and the figure the relay page boots with. While no theme
is picked, the page draws its figure again in the system's theme each time
that theme changes, through a `change` listener on the media query. An address
naming `darkMode`, a click on a button of the theme, and a host's message or a
call to `window.tsncd.display` naming `darkMode` each pick a theme, and a
figure the relay or `window.tsncd.render` draws with settings of its own ends
the following as well. Nothing is kept in `localStorage`. Before the ruling
the page remembered the chosen form and theme under `tsncd-form` and
`tsncd-dark-mode`, and a remembered choice, then the settings of the message,
applied where the address named none.

After every switch of the variant, the form or the theme the page writes the
three on display into its address, so an address copied from the page names
all three. A page no one has switched keeps the address it was opened with, so
it follows the system's theme again when it is opened again. A message from
the relay is drawn with its own settings, and the switch then applies to it as
to any held figure. A switch asked for before the page holds a figure, as a
host posting on the load of its iframe does, is stored and applied to the
page's own message above the query parameters. The relay page switches the
last term it received the same way, and a page inside an inspection box draws
no controls. `src/advanced_display/displaySelector.ts` draws the row, holds
the switch and follows the system's theme, and the user asked for the switch
on 2026-09-26.

The box of the width holds the `width` setting in pixels. A width typed into it
is applied when the reader presses the enter key or leaves the box, and the
switch then draws the held term again at that width, so the figure is placed
again from the start with its rows wrapped at the new width. A width under 200
pixels, or text that is not a number, is refused, and the box shows the width
on display again. Each variant of a page carries a width of its own, and a
variant is drawn at its own width until the reader types one, after which every
variant is drawn at the width typed. The width is not written into the address,
and the address, a host's message and `window.tsncd.display` do not set it. The
user asked for the box on 2026-09-29.

The buttons of the sizing, Fixed and Dynamic, stand after the box of the width
and set `dynamicMultilineSizing` through the same switch. A variant is drawn
with its own sizing until the reader presses one, after which every variant is
drawn with the sizing pressed. The address, a host's message and
`window.tsncd.display` do not set it. The user asked for the setting on
2026-09-29.

### A page that reads its address strictly and reports its state to a host

A page reads five query parameters of its address and no others.

| parameter | the values it takes |
|---|---|
| `variant` | the id of a variant the page offers, and none on a page holding one figure |
| `form` | `arrows-and-boxes`, `arrows-and-broadcasted`, `all-broadcasted` |
| `darkMode` | `true`, `false` |
| `controls` | `shown`, `hidden` |
| `displayMode` | `slow`, `fast` |

A page offers its variants for choice where it carries two or more. A page
holding one message, a page carrying one variant and the relay page offer
none. The page checks its address once its variants are read, before anything
is drawn and before a socket is opened. An address that names another
parameter, sets a parameter twice, or sets a parameter to a value outside its
row is refused, whatever the rest of it says. A value is compared as it is
written, so `darkMode=True` and `displayMode=FAST` are refused. A refused
address draws no figure, opens no socket, builds no controls and sets no
`window.tsncd`. The page writes, where the ring stood, that its address was
refused, and a sentence naming the parameter, the value and the values
accepted, such as `The parameter "form" is set to "bad". It takes
"arrows-and-boxes", "arrows-and-broadcasted" or "all-broadcasted".` Before
2026-09-27 a value its setting did not take was dropped and the page drew its
figure with the rest of the address. A link carrying a parameter that another
site adds for its own counting, such as `utm_source` or `fbclid`, is refused
too. Where the address names no form or theme, the page opens in the
all-broadcasted form and the system's theme, per *A page that switches its
form and its theme*.

After every switch of the variant, the form or the theme the page writes the
three on display into its own address with `history.replaceState`, so no entry
is added to the history. The query then reads `variant`, where the page offers
variants, `form` and `darkMode`, followed by the `controls` and the
`displayMode` the address already carried, and the hash is kept. An address
copied from the page after a switch therefore draws the same figure for any
reader, whatever the theme of that reader's system. A page no one has switched
keeps the address it was opened with. While the page follows the system's
theme, an address it has written is written again when that theme changes. The
links of the selector's options are written after every draw, each naming its
variant with the form and the theme on display. A frame whose origin is opaque
may throw on `replaceState`, and the page then keeps the address it was opened
with. Headless Chromium rewrites the address of a page opened from `file://`
and of a page served over HTTP in a frame sandboxed without
`allow-same-origin`.

A page held in a frame of another page posts messages to the parent frame with
`postMessage` and the target origin `*`, because a page in a sandboxed frame
does not know the origin of its host, and the messages carry nothing private.
A page opened on its own posts nothing. The state message reads:

```jsonc
{"type": "tsncd-state", "variant": "cached-quantised", "form": "arrows-and-boxes",
 "darkMode": false,
 "variants": [{"id": "decode-quantised", "group": "decode", "title": "Quantised",
               "detail": "The whole model with BF16 weights and activations…"}, …],
 "groups": [{"id": "decode", "title": "Decode"}, {"id": "cached", "title": "Cached"}]}
```

`variant` is `null`, and `variants` and `groups` are empty, on a page that
offers no variants. `detail` is the empty string for a variant that carries
none, and a group holding no variant is left out. The page posts the state
after every draw, a draw that follows the system's theme among them. It posts
one before its first draw where it carries its own message or variants, naming
what it is about to draw, so a host can build its selector while the first
variant is prepared. It also posts one in answer to every `tsncd-display`
message it accepts, once the switch has settled, so a switch that draws is
answered twice with the same state.

A host switches the page by posting `{type: 'tsncd-display', variant, form,
darkMode}` to the frame's window, with any of the three fields. The fields are
checked as the address is, with typed values: `variant` a string naming a
variant the page offers, `form` one of the three forms, and `darkMode` the
boolean `true` or `false`. A field holding `undefined` is left out, and a
message holding no field changes nothing and is answered with the state. A
message naming a variant with a form or a theme has the variant drawn in them,
in one draw, and a message naming `darkMode` ends the following of the
system's theme. A message holding another field, or a field holding another
value, changes nothing, and the page answers:

```json
{"type": "tsncd-refused", "parameter": "form", "value": "bad",
 "accepted": ["arrows-and-boxes", "arrows-and-broadcasted", "all-broadcasted"]}
```

For a parameter the page does not read, `accepted` lists the parameters it
reads, and for a `variant` on a page offering none it is empty. A page whose
address is refused posts the same message once, naming the parameter of the
address. `window.tsncd.display` takes the same fields and rejects with the
sentence the page writes for a refused address.

[`pageChoices.ts`](src/advanced_display/pageChoices.ts) checks the address and
the choices and writes the address, and
[`hostMessages.ts`](src/advanced_display/hostMessages.ts) posts and answers
the messages. `test/page_choices.test.ts` and `test/host_messages.test.ts`
hold the tests. The user asked on 2026-09-27 for links that follow the reader
and for an invalid link to draw nothing, so that the lab website can hold the
page in a frame and supply its own toolbar.

### The figure a page boots with

A page that carries no message of its own draws the figure the build carries,
and the first `dataUpdate` to arrive replaces it. The figure is
`json_files/deepseek_v41_flash_text_only_quantised.json`, one `dataUpdate` with
the three fields a relayed message has, built by the `DiagramMode.BROWSER` cell
of `pyncd`'s `notebooks/sota/DeepSeekV41FlashTextOnlyQuantised.ipynb`: the
quantised text-only DeepSeek-V4.1-Flash drawn without the bodies of its blocks,
with the legend of its axes and an inspection box over every block and every
operator. The file runs to 12.5 MiB, of which the term is 6.6 MiB and the
auxiliary information 5.9 MiB.

The page fetches the file rather than carrying it in the bundle, because a
browser parses the whole bundle before the renderer runs.
[`boot_message.ts`](src/data_transfer/boot_message.ts) holds the path and
fetches the message. `webpack.config.js` writes the file from `public/` into
`dist/` at that path, and the dev server serves it from the compilation.

The relay keeps whatever it holds. The entry point opens the socket first and
claims the display only after it has fetched the message and built the term,
testing the claim in the same synchronous run as the draw, so a term the relay
was holding and a term `window.tsncd.render` drew each keep the screen and the
boot figure is dropped. Where the relay holds nothing, and where no relay
answers at all, nothing else claims the display and the boot figure is drawn.

The message carries its own `settings` and `auxiliary` and is drawn through the
`termPass` a relayed message is drawn through, so its legend, its inspection
boxes and its axis haloes answer the pointer as a sent figure's do. It carries
no localisations, because the notebook that built it declares none, so the page
draws no wording buttons over it.

### The `auxiliary` field

`tsncd` does no algebra, so every fact the legend and the boxes show is computed
in `pyncd` and sent beside the term.
[`websocket_transfer/auxiliary_information.py`](../pyncd/websocket_transfer/auxiliary_information.py)
assembles it and
[`src/advanced_display/`](src/advanced_display/AuxiliaryInformation.ts) reads
it. The field is optional on `dataUpdate` and on `renderRequest`, and a message
without it draws as it did before the field existed. Every part of it is
optional in turn.

```jsonc
{
  "legend": [
    {"latex": "m", "text": "m", "size": 64,
     "codeName": "hidden", "sizeCodeName": "hidden_size",
     "uids": [1670598927]}
  ],
  "naturals": [
    {"latex": "|v|_{32000}", "size": "32000", "codeName": "vocabulary_size",
     "key": "#1495078367"}
  ],
  "blocks": {
    "10175062": {
      "title": "\\text{Norm block}",
      "formula": "\\mathrm{RMSNorm}_{m}(Wx)",
      "description": "A linear map followed by an RMSNorm over the hidden axis.",
      "references": [
        {"label": "pyncd Operators.py", "url": "https://…",
         "path": "data_structure/Operators.py", "line": 469, "endLine": 480,
         "icon": "huggingface"}
      ],
      "indices": []
    }
  },
  "expansions": {
    "2": {
      "operator": "Caching",
      "latex": "K",
      "formula": "y[i_{P}] = \\mathrm{cache}[i_{P}], \\qquad y[\\lvert P \\rvert + j_{x}] = v[j_{x}], …",
      "description": "The entries the cache holds for the tokens P of the earlier passes …",
      "indices": [{"index": "i_{P}", "axis": "P"}, {"index": "j_{x}", "axis": "x"}],
      "expansion": "{\"uid_repository\": …, \"data\": …}",
      "auxiliary": { … },
      "references": [ … ]
    }
  }
}
```

`legend` is sorted by the sender, and the client draws the rows in the order
they arrive. `size` is the integer the axis comes to, and is null where the term
is symbolic and nothing sized it. `codeName` is the code form the axis name
carries, and `sizeCodeName` the code form of its size. `uids` lists the uid of
every axis of the term the row stands for, which is the integer the JSON carries
on the axis's `uid`, and is what links the row to the wires of the figure. A
sender from before the field existed leaves it out, and the row then answers no
pointer.

`naturals` is the second table of the legend, one row per `cat.Natural` that is
the datatype of an array of the term, or that the datatype of such an array
holds, sorted by the sender. `latex` is the sender's latex of the bound the
values of the natural stay below. `size` is the integer the bound comes to,
written as a string of decimal digits because the bound `2^{63}` of a 64-bit
integer is larger than the largest integer a JavaScript number holds exactly, or
null. `codeName` is the bound written in the code names of its symbols, or null.
`key` is the structure of the bound, which `pyncd`'s
`auxiliary_information.natural_key` writes and the client's
[`find_naturals_by_key.natural_key`](src/data_structure_processing/find_naturals_by_key.ts)
writes the same way for the natural of every wire. A symbol is written as `#`
and its uid, an integer as its decimal digits, a sum, a product and a power as
`+`, `*` and `^` followed by the keys of their parts in brackets and separated by
commas, and any other numeric as `?`. The bound `2^{63} / \hat{v}` is written
`*(^(2,63),^(#1151854266,-1))`, and `|x_{new}| + |x_{old}|` is written
`+(#271053727,#2106987274)`. Two naturals with one key are one row, and the key
is the highlight `natural:<key>` their wires and labels answer to. The field was
added on 2026-09-27.

`blocks` is keyed by the uid of each block's tag, written as a decimal string,
which is the integer the JSON carries on the tag's `uid`. A box is opened from
the operation box of a `BlockOperator`, which is its glyph alone, without the
node box stacked above the glyph where the operator has one, and the block it
opens is the one that operator holds. `formula` is optional, and is the LaTeX of
what the block computes, drawn under the title in display mode exactly as an
expansion's formula is. A reference with a null `url` is written as plain text,
with its path and its line beside its label. A reference may carry `icon`, the
name of an icon drawn before it, which
[`src/advanced_display/referenceIcons.ts`](src/advanced_display/referenceIcons.ts)
holds the drawing for. The sender chooses the name, and `huggingface` is the
one the table holds, so a link to a model on Hugging Face is drawn with that
logo and a name the table does not hold draws nothing.

The indices of a `formula` arrive lettered, i, j, k and onwards in the order
the formula first names them, each with its axis as its subscript. `indices`
lists the indices the formula holds for every position of their axes, in that
order, each as the formula writes the index, `j_{d}`, and as it writes the axis,
`d`. The client draws them on the line under the formula that `inspectionBoxes`
describes, `\forall i_{P} \in P,\; j_{x} \in x`, and draws no line where the
list is empty or absent. An expansion carries the same two fields.

The index of a guarded axis, whose positions hold a value under an affine
condition on the indices of its guides, carries `condition`, the LaTeX of that
condition, `j_{w|x} \le i_{x}`, and, where the stride of the axis is 1 or -1,
`range`, the interval of the positions that hold a value,
`[0, \min(i_{x}, |w| - 1)]`. The line writes the index over `range` where there
is one, `j_{w|x} \in [0, \min(i_{x}, |w| - 1)]`, and over the axis otherwise.
The tooltip of the clause adds "The position $j_{w|x}$ holds a value where
$j_{w|x} \le i_{x}$, and the universal unit elsewhere." Every index a range
names stands earlier on the line, because `pyncd` places each guide before the
index it guides and introduces a guide the formula does not name with a letter
of its own. The two fields were added on 2026-09-28.

The `drawing` field of a block's `BlockAesthetics` says how the block itself is
drawn, and travels in the term rather than in this field. `BOX`, which is what
an absent field reads as, is the enclosure with a title and a fill. Under
`BODY_IN_PLACE` the block's body is drawn where the block stands and the block
itself is drawn not at all: no enclosure, no title and no space of its own, and
the body is not queued as a sub-diagram beside the figure whatever `subBlocks`
says. The wrapper still answers the pointer, so the box it opens holds the
title, the formula, the description and the references, and draws no diagram.

Two bodies are drawn that way. An operator's block holds a single `Broadcasted`
whose domain and codomain are the wrapper's own, and the operation box drawn for
it is the region the pointer opens the box over. A reindexing's block stands in
the `reindexings` of a `Broadcasted`, alone or inside a `ProductOfMorphisms`
beside an identity, and holds the morphism of the stride category that the
reindexing is; the pentagon or the hexagon drawn for it is that region. Every
reader that decides a figure from a reindexing reads such a block as its body,
so the weave, node and join forms and every label are what they would be with no
block in the term. The client draws any other block as a box.

`expansions` is keyed by the number the client gives each `Broadcasted` as it
builds the term. `TermJSONConverter.to_term` walks the document depth first, in
the order the fields were written, and counts a `Broadcasted` when it enters the
record, before converting that record's fields. A reference into the
`uid_repository` is descended into the first time it is met and is the already
built term on every later one, so nothing inside it is counted twice.
`pyncd`'s
[`data_transfer/broadcast_occurrences.py`](../pyncd/data_transfer/broadcast_occurrences.py)
reproduces that walk over the Python term, and
[`test/broadcast_occurrences.test.ts`](test/broadcast_occurrences.test.ts)
checks that every key lands on a node whose operator is the class the sender
named.

An expansion may carry `references` of its own, the places in a codebase the
operator stands for, written exactly as a block's are and drawn under the
description.

`expansion` is a full term payload, doubly encoded exactly as a message's `data`
is, and `auxiliary` is the auxiliary information of that expanded morphism. The
expansion numbers its own broadcasts from zero, so an operator standing inside
one is opened the way an operator in the main figure is.

### `dataRequest` — client → server

Asks for the currently held term; answered with a `dataUpdate`, or
`{"msgType": "No Data Available"}`.

### `renderRequest` — notebook → server → browser

A `dataUpdate` whose sender wants the picture back.

```jsonc
{
  "msgType": "renderRequest",
  "requestId": "9f2c…",           // uuid4().hex
  "data": "…",                     // as dataUpdate
  "settings": { … },               // as dataUpdate
  "auxiliary": { … },              // as dataUpdate
  "capture": {
    "format": "png",              // or "svg"
    "scale": 2,                    // device pixel ratio; png only
    "padding": 16,
    "background": "auto"          // theme canvas; null for transparent
  },
  "disturbDisplay": true
}
```

With `disturbDisplay` — the default, and what an absent flag means — the diagram
is drawn on screen and the image cut from it, so a capture and a plain display
are the same render with different follow-through. Note that the settings travel
with it, so a disturbing capture applies its own `debugBorders` to the visible
diagram too.

With `disturbDisplay: false` the browser renders into a second, off-screen
target and the display is left alone. The server also **declines to store** the
term in that case: overwriting it would leave the display intact only until the
next reload, which is a disturbance with a delay on it. See
[Two render targets](#two-render-targets).

`capture` is partial on the same terms as `settings`, defaulting from
[`capture.ts`](src/data_transfer/capture.ts) and assembled on the Python side by
[`capture.capture_options`](../pyncd/websocket_transfer/capture.py).
`padding` is measured outward from the diagram's *content* box, which is not the
container's own box: the overlay overhangs it (see [Framing](#framing) below).

Only `png` and `svg` cross the wire. PDF exists, but only on the headless path,
since it comes from the browser's print pipeline rather than from anything the
page can serialise itself.

An omitted `capture.background` or the value `"auto"` uses the rendered
target's canvas color. A CSS color such as `"#ffffff"` overrides the canvas.
`null` exports a transparent canvas. The choice applies to the entire image,
including padding. Glyph surfaces retain their theme colors. Explicit
backgrounds keep their meaning for existing clients. Older browser builds
require an explicit color because they do not resolve `"auto"`.

### `renderResult` — browser → server → notebook

```jsonc
{
  "msgType": "renderResult",
  "requestId": "9f2c…",
  "mime": "image/png",
  "payload": "iVBORw0KGgo…",      // base64 for png, markup for svg
  "encoding": "base64",            // or "utf-8"
  "width": 812, "height": 460      // CSS px, before scale
}
```

or, when the render failed:

```jsonc
{ "msgType": "renderResult", "requestId": "9f2c…", "error": "…" }
```

Failures come back as messages rather than dropped connections because a
notebook cell is blocked on this reply; an exception that never arrives shows up
only as a timeout with no cause attached. `result_to_bytes` is where an error
result becomes a `CaptureError`.

## How a capture is correlated

The `npm run capture -- --output tmp/current.png` command identifies as a
`DataClient`, fetches the held term with `dataRequest`, then sends a
`renderRequest` with `disturbDisplay: false`. The command preserves the held
settings and applies any `--dark-mode` or `--width` override only to the
preview. `--watch 2000` repeats the sequence after each capture completes and
a 2000 ms delay. The command works with either relay implementation and adds
no message types.

The browser processes incoming messages in order. A capture completes before
the next message can rebuild a render target.

The reply travels over a *different* connection from the request, so it cannot
simply be "the next message" — hence `requestId`.

1. The notebook sends `renderRequest` and keeps its connection open.
2. The server records `requestId → the requesting socket`, then relays to **all**
   diagram clients so they stay on the same term.
3. The notebook reads past the server's acknowledgement until a `renderResult`
   with its own `requestId` arrives, under a total timeout.
4. The server pops the `requestId` and forwards the first result. Later replies
   — from other tabs rendering the same request — find nothing pending and are
   dropped.
5. If the requester disconnects mid-capture, its pending entry is discarded, so
   no image is pushed at a closed socket.

Three failures are handled explicitly, because each would otherwise present as
an unexplained hang:

| Situation | Result |
|---|---|
| No diagram client connected | Immediate `renderResult` carrying an error |
| Browser never answers | Client-side timeout, `DEFAULT_CAPTURE_TIMEOUT` (60 s) |
| Several tabs answer | First wins, rest dropped |

## Frame size

`websockets` rejects frames over 1 MiB by default and **closes the connection**
rather than reporting the problem. `ws` does the same over its `maxPayload`. A
captured PNG passes 1 MiB comfortably, so every end raises the ceiling to
`MAX_MESSAGE_BYTES` (64 MiB). Three calls take it: `websockets.serve` and
`websockets.connect` in Python, and `WebSocketServer` in `diagram_server.ts`.
Changing the ceiling on one side only reintroduces the failure.

## Where the time in a capture goes

The timings below were measured on the transformer figure, which holds 2219
elements at 902 x 632 CSS px. A headless Chromium captured it as a PNG at
`scale` 2. The whole round trip takes about 2.3 seconds.

| stage | ms |
|---|---|
| Building the `DiagramElement` tree and laying it out | 63 |
| Waiting on `document.fonts.ready` and one settled frame | 33 |
| `html-to-image` serialising the DOM into a 14.8 MB SVG string | 2098 |
| Decoding that string to an image and drawing it onto a canvas | 16 |
| Encoding the canvas as a PNG | 127 |
| Relaying 373 KiB of base64 inside JSON through the server | 21 |
| `json.loads` and `base64.b64decode` in the notebook | 0.7 |

Serialisation is 87% of the round trip. The format table below gives the reason.
Reaching the diagram through a `foreignObject` means reproducing the diagram from
inline styles. `html-to-image` writes each element's full computed style, some
6.9 KB across 2219 elements. The PNG that comes out is 279 KiB, so 98% of the
string is built and discarded.

The socket carries 1% of the capture. Its cost still differs sharply by
implementation, measured as the round trip of a 373 KiB frame across a loopback
echo:

| relay | throughput |
|---|---|
| Python `websockets`, in `run_server.py` | 34 MiB/s |
| node `ws`, in `npm run server` | 447 MiB/s |
| A raw loopback TCP socket, for reference | 1500-2500 MiB/s |

Python's `websockets` is a factor of 50 off a raw socket even with its masking
extension built. On a PNG the gap is 21 ms against 2 ms out of a 2.3 s round
trip. On the 14.8 MB SVG the gap is 1.0 s against 0.07 s. The serialisation has
already cost 2.1 s before the transfer begins. The socket cost is a further
reason to prefer `pdf` for vector output.

Anything that would make a capture appreciably faster has to replace
`html-to-image`. Playwright's screenshot of the same figure takes 242 ms. The
nine-fold speed-up comes from Chromium painting a layout it already holds
instead of rebuilding one from inline styles. The headless path already takes
Playwright's screenshot. Inside a live browser the same saving would come from
writing an SVG document out of the geometry the renderer has already
computed.

## Framing

The diagram overhangs its own container.
[`HTMLDrawHandler`](src/display/HTMLRender/HTMLDrawHandler.ts) places each SVG
layer at `(-BUFFER, -BUFFER)` relative to `#diagram` and sizes it past the far
edge, so an image cut to `getBoundingClientRect()` loses the overlay on every
side. `contentBox` in [`capture.ts`](src/data_transfer/capture.ts) therefore
measures the union of the container and all its descendants rather than
assuming a number — if `BUFFER` changes, the framing follows.

Zero-area elements are skipped in that union: anchors, wire stubs and spacers
are structural, several sit at the origin, and including them would drag the box
out to nothing.

An inspection box reads the same measurement for another purpose.
[`inspectionBoxes.ts`](src/advanced_display/inspectionBoxes.ts) gives the
container of the drawing inside a box the overhang as its margin, so the ink of
the drawing stands inside the box, and it wraps the first drawing of a term at
the core width less `2 * BUFFER` so that the room is there before the drawing is
measured.

The headless path has a further constraint. A capture box routinely starts at
negative page coordinates — the content already overhangs, and the requested
padding usually exceeds the page's own — and **Playwright silently clamps a clip
to the page** rather than reporting it, quietly trimming the margin. So
[`HeadlessRenderer.isolated`](../pyncd/websocket_transfer/headless.py)
strips the page to the diagram alone and moves it to the origin before
screenshotting or printing, making the box valid by construction. Everything is
reverted afterwards, so a batch can mix formats.

## Two render targets

An undisturbing capture needs somewhere else to draw, so the entry point builds
a second container with its own render handlers. It cannot be the same handlers
pointed elsewhere: they hold per-container state — measured rectangles, pending
block references — so the second target is a second set.

The off-screen container is **laid out, not hidden**. `display: none` measures
zero, and since every box position comes from `getBoundingClientRect`, the
diagram would come out collapsed onto the origin. `visibility: hidden` lays out
correctly but captures blank, because the clone inherits it. So it is parked
outside the viewport instead — to the *left*, since overflow in the negative
direction creates no scrollbar.

It is parked with `transform`, not `left`, and that distinction is load-bearing.
`html-to-image` seeds its clone from the computed style via `cssText`, and that
text carries the logical shorthand `inset-inline` *after* `left`. Assigning
`style.left` on the clone updates `left` in place, so the later shorthand still
wins, the clone stays parked off-frame, and the capture comes back blank at any
offset. `transform` has no competing shorthand and the capture overwrites it
outright.

One further thing had to be isolated. SVG `url(#…)` references resolve
**document-wide**, so the drop-shadow filter — which used a single hardcoded id
for every shadow in the document — let the two targets' definitions answer for
each other. Harmless while one diagram owned the page; with two targets it made
an off-screen render perturb the visible diagram's shadows. Each SVG layer now
mints its own id.

## Fonts, and why the stylesheet is bundled

Capture serialises the DOM into an SVG `foreignObject`, which means fonts have to
be inlined as data URIs — and that requires reading `cssRules`, which browsers
refuse on a cross-origin stylesheet. KaTeX loaded from a CDN would therefore
capture in a fallback face; because the wires are drawn from *measured* text
boxes, that moves the geometry, not just the glyphs. So KaTeX's stylesheet is
bundled from `node_modules` by
[`HTMLAnnotationHandler.ts`](src/display/HTMLRender/HTMLAnnotationHandler.ts)
and served same-origin.

Since 2026-09-16 the fonts are written into the bundle as well.
[`webpack.config.js`](webpack.config.js) turns each woff2 file into a data URI,
so the bundle requests no file once it has loaded, and `dist/` holds
`index.html` and the bundle alone. KaTeX's stylesheet lists each face as woff2,
woff and ttf in that order, and a browser takes the first format it reads. Every
browser that runs the bundle reads woff2, so the other two are written as empty
data URIs. Writing the fonts in added about 340 KiB to the bundle, which
`npm run build` now reports as 958 KiB. A capture of the bundled transformer is
byte for byte the same under the two builds.
[A page that carries its own message](#a-page-that-carries-its-own-message)
depends on the fonts being in the bundle, because a page opened from `file://`
cannot reach a file the bundle names by an absolute path.

For the same reason every capture waits on `document.fonts.ready` plus a full
frame before measuring anything.

## The headless path, which uses none of this

[`headless.py`](../pyncd/websocket_transfer/headless.py) drives its own
browser and does **not** connect to the server. A figure rebuild should not
depend on a server being up or on which tab happened to be focused. It serves
tsncd's built `dist/` on a loopback port — `file://` will not do, since webpack
builds with `publicPath: '/'` — and reaches the renderer through a hook the
entry point installs on `window`:

```ts
window.tsncd = {
  render(payload, settings): Promise<{width, height}>,  // same termPass the socket uses
  capture(options): Promise<CaptureResult>,             // in-page serialiser; needed for svg
  captureBackground(background): string | null,         // resolves auto from the diagram theme
  bounds(padding): {x, y, width, height},               // page coords, for a screenshot clip
  settled(): Promise<void>,                             // fonts loaded, layout stable
}
```

Both paths render through the same `termPass`, so they agree by construction
rather than by discipline. Three output formats, and the choice matters:

| | Produced by | Typical size | Use when |
|---|---|---|---|
| `png` | Playwright screenshot | ~190 KB | Default. A real browser paint — nothing can be lost in serialisation. |
| `pdf` | Chromium's print pipeline | ~140 KB | Figures for a paper. True vector, real embedded text. |
| `svg` | `window.tsncd.capture` | **~15 MB** | Only when something downstream demands SVG. |

That SVG figure is not a typo. Serialising into a `foreignObject` means
reproducing the diagram from inline styles, and `html-to-image` writes the *full
computed style* — some 6.9 KB — onto each of ~2000 elements. Fonts account for
650 KB of the file; the other 95% is CSS with no bearing on the drawing. Prefer
`pdf` for vector output. A notebook storing one such SVG output grows to 15 MB
against 256 KB for the PNG — 59× — so SVG is a poor return format even though
Jupyter renders it perfectly well.

### What is inside the PDF

Worth knowing before relying on it. One page, sized exactly to the diagram, with
all three KaTeX faces embedded and subsetted, and the labels as real selectable
text (subscripts arrive as separate glyphs — `L q`, not `L_q` — which affects
extraction, not appearance).

It is **not** entirely vector. `feDropShadow` has no PDF equivalent, so Chromium
rasterises every shadowed element — 24 images, 36% of the file, at roughly
192 DPI. Wires, fills and text stay vector. That resolution cannot be raised:
PDF output is byte-identical at `scale` 1, 2 and 4, because the print pipeline
does not see the device scale factor. Dropping the shadows would make it fully
vector and fully editable.

### Saving a set

[`save_figures`](../pyncd/websocket_transfer/headless.py) takes names
rather than paths and writes them into one directory — `./outputs` by default,
which for a notebook is beside the notebook — in one browser session:

```python
await save_figures({'attention': attention, 'convolution': conv}, width=1400)
# -> ./outputs/attention.pdf, ./outputs/convolution.pdf
```

PDF by default, since that is what a paper wants. A name may carry its own
extension to override the format for one figure, and may include
subdirectories. Options apply to the whole set; for per-figure control, drive
`HeadlessRenderer.save` directly.

## Changing the protocol

Add a message type in every implementation the table at the top names, and
document it in **both copies of this file**. Both servers refuse a type they do
not recognise, so a half-applied change fails at the first message rather than
quietly rendering nothing. Python's `match` raises and closes the connection with
no reason attached. `diagram_server.ts` closes the connection with the offending
message as the close reason. The failure surfaces either way once both
repositories are updated and **the server is restarted**, since a long-running
server keeps executing the code it started with.

## FAST selects experimental rendering optimizations

`settings.displayMode` accepts `fast` (the default) or `slow`. Python exposes
`DisplayMode.SLOW` and `DisplayMode.FAST` through `display_settings(displayMode=...)`
and `DiagramSettings.display_mode`. The delivery mode, such as HTML or BROWSER,
is independent. SLOW retains the existing renderer and inspection preparation.
FAST measures diagram positions together before drawing and prepares inspection
diagrams when opened, retaining their content for reuse. The setting propagates
to inspection diagrams and capture targets.

An exported HTML page accepts `?displayMode=slow` or `?displayMode=fast` in
its address, and the value takes precedence over its embedded setting. Any
other value refuses the address, per *A page that reads its address strictly
and reports its state to a host*. The override applies to the page's own
message and to the figure a page boots with, and does not change the settings
of a message from the relay.

## COMPRESSED exports share JSON values by content

`TermJSONConverter.export_to_json(term, export_form=TermExportForm.COMPRESSED)`
and `export(..., export_form=...)` select the experimental compressed format.
`TermExportForm.UID_REFERENCES` remains the default and emits the existing
`uid_repository`/`data` envelope unchanged. The Python `import_from_json` method
and the TypeScript `TermJSONConverter.import` method accept both forms.

A compressed document has this envelope:

```json
{
  "export_form": "compressed",
  "version": 1,
  "value_repository": [[0, "x"], [0, 7], [2, [0, 1]]],
  "data": 2
}
```

The example decodes to `{"x": 7}`. Each repository entry is `[kind, payload]`:
kind 0 holds a scalar, kind 1 holds an array of reference indices, and kind 2
holds alternating field-name and field-value indices. Every child reference
points to an earlier record. `data` identifies the root. For a term export, that
root is the original envelope containing `uid_repository` and `data`.

The Python compressor hashes each record with SHA-256 and checks the encoded
record inside each hash bucket, so a hash collision cannot merge distinct values.
Equal objects, arrays, field names and scalar values share records. References
are compact integer indices within the document; full hashes are not repeated
on the wire. Object field order participates in the record because TypeScript
constructors consume those fields positionally. Boolean and numeric scalar
values remain distinct. Unsupported versions, malformed records, missing
references and references to the current or a later record are rejected.

Decoding shares JSON containers, which callers treat as read-only. Term
construction still visits each non-UID occurrence separately. Only UID terms
retain the existing object-identity cache, so operation occurrence numbers and
auxiliary expansion keys keep their meaning. Compression is independent of the
FAST/SLOW rendering setting.

Repositories are currently local to each term export. The main expression and
inspection expressions can each use COMPRESSED, but do not yet share a repository
with one another. Smaller raw JSON does not guarantee a smaller HTTP-compressed
download; the experimental full DeepSeek page is 4.94 MB instead of 14.07 MB,
while Brotli sizes are 492 KB and 478 KB respectively.
