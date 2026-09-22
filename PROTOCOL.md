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
  "auxiliary": { "legend": [ … ], "blocks": { … }, "expansions": { … } }
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
its uid, so two axes that happen to share a name do not light together.

`axisLabelFontSize` (default `0.8`) is the size, in em, of the label an axis
carries on its wire, which is the name and the size drawn in a composed gap, at
the ends of a row and along a tape. The label is measured at the size it is
drawn at, so a figure asking for a larger label is laid out with the room that
label needs. The setting reaches the drawing through
`axis_label_font_size` in
[`RenderHandlerSettings.ts`](src/display/Render/RenderHandlerSettings.ts), and
no other label reads it: an operator's name, a block's title, a tape's slot
label, a datatype's label and the strides of a reindexing keep their own sizes.

The default suits a screen. A figure spanning a paper's text block usually
wants 1000–1400.

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

The page is painted in the canvas colour of the dark theme by its own
stylesheet, before the bundle runs, and shows a turning ring in the element
`page-loading` until its figure is drawn. Once the message is read, and before
its term is built, [`loadingScreen.ts`](src/display/loadingScreen.ts) repaints
the page in the theme of the message, so a light figure arrives on a light page
and no white page stands where a dark figure is about to. The first draw
removes the ring, and a page whose figure cannot be drawn writes the reason
where the ring stood. A page with no message of its own shows the ring while
it fetches the figure it boots with.

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
  "blocks": {
    "10175062": {
      "title": "\\text{Norm block}",
      "formula": "\\mathrm{RMSNorm}_{m}(Wx)",
      "description": "A linear map followed by an RMSNorm over the hidden axis.",
      "references": [
        {"label": "pyncd Operators.py", "url": "https://…",
         "path": "data_structure/Operators.py", "line": 469, "endLine": 480,
         "icon": "huggingface"}
      ]
    }
  },
  "expansions": {
    "2": {
      "operator": "Normalize",
      "latex": "RMSNorm",
      "formula": "\\mathrm{RMSNorm}_{m}(x) = …",
      "description": "Each value scaled by the inverse square root of …",
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

An exported HTML page accepts `?displayMode=slow` or `?displayMode=fast` in its
address. A valid override takes precedence over its embedded setting, while an
absent or invalid value leaves that setting unchanged. The override applies only
to standalone pages and does not change the relay's held settings.

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
