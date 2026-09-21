// Claude Opus 5, effort high.
/*
 * A container together with everything needed to draw a term into it.
 *
 * The module sits above `Render`, `Framework` and `HTMLRender` and composes the
 * three, which is why it is here rather than inside one of them. `src/index.ts`
 * built this function inline until the inspection boxes needed a second target
 * inside a box, and a box is opened by a decorator that already holds a
 * context. Anything that draws a diagram now goes through
 * `make_render_target`.
 *
 * A target is built per container. The renderers hold per-container state, the
 * measured rectangles and the pending block references among it, so an
 * off-screen target is a second set of them rather than the same ones pointed
 * elsewhere.
 */

import * as cat from '../data_structure/Category';
import * as rh from './Render/RenderHandler';
import * as rhs from './Render/RenderHandlerSettings';
import * as html_render from './HTMLRender/HTMLRenderHandler';
import * as broadcasted_box from './Framework/BroadcastedCategoryRenderer';
import * as para from './Framework/para/ParaCategoryRenderer';
import * as mlc from './Framework/Multiline';
import * as ut from '../utilities/utilities';
import * as DiagramTheme from './Render/DiagramTheme';
import type * as aux from '../advanced_display/AuxiliaryInformation';
import {CategoryRenderer} from './Framework/CategoryRenderer';

const WIDTH = 750;

/*
 * What a render target draws: an expression, or the definition of one.
 *
 * A `cat.DefinedExpression` is a `Term` and is not a morphism, so it has no
 * domain and no codomain and no `MorphismBox` can hold it. `render_definition`
 * draws its two sides as two figures with a `:=` between them.
 */
export type DiagramFigure =
    cat.BroadcastedCategory<any, any> | cat.DefinedExpression<any, any>;

/* The `:=` a definition is drawn with, the size it is set at, and the room
 * left either side of it. It is set larger than an axis label because it
 * separates two whole figures rather than naming a wire. KaTeX sets a bare
 * `:=` as a colon relation followed by an equals, with the spacing of a
 * relation between the two, and `\coloneqq` is the one glyph. */
const DEFINITION_GLYPH = '\\coloneqq';
const DEFINITION_GLYPH_FONT_SIZE = 1.6;
const DEFINITION_GLYPH_PADDING = 24;
/* The narrowest a side of a definition is wrapped at, for a `width` small
 * enough that half of it less the glyph comes to nothing. */
const MINIMUM_DEFINITION_SIDE_WIDTH = 120;

/*
 * The `:=` between the two sides of a definition, sized in the build phase and
 * typeset over its own rectangle in the draw phase.
 *
 * The annotation carries no colour, so `DiagramTheme.adaptAnnotationSettings`
 * gives it the theme's foreground and the glyph reads in both modes.
 */
class DefinitionGlyph extends rh.DiagramElement {
    private annotation: rh.AnnotationElement;
    constructor(
        public renderHandler: rh.RenderHandler,
    ) {
        super(renderHandler);
        this.annotation = new rh.AnnotationElement(
            renderHandler,
            DEFINITION_GLYPH,
            {font_size: DEFINITION_GLYPH_FONT_SIZE},
        );
        const text_dims = this.annotation.estimated_text_dims();
        this.children = [new rh.CoreElement(renderHandler, {
            x: text_dims.x + 2 * DEFINITION_GLYPH_PADDING,
            y: text_dims.y,
        })];
    }
    update(): void {
        super.update();
        this.annotation.place(this.rectangle());
    }
}

export interface RenderTarget {
    container: HTMLElement;
    /* `settings` is optional, falling back to the render handler's own
     * defaults, and `auxiliary` is absent on a message that sends none. */
    termPass: (
        term: DiagramFigure,
        settings?: rhs.RenderHandlerSettings,
        auxiliary?: aux.DiagramAuxiliary,
    ) => void;
}

/**
 * A drawn diagram, handed to each decorator once the render has finished.
 *
 * Every phase is complete by then, so an element may be measured and the
 * container may be added to. `makeSubTarget` builds a target over a container
 * inside this one, carrying the same decorators, which is how a box opened over
 * a diagram holds a diagram of its own.
 */
export interface RenderedDiagram {
    container: HTMLElement;
    renderHandler: html_render.HTMLRenderHandler;
    renderer: CategoryRenderer<any, any, any>;
    term: DiagramFigure;
    settings: rhs.RenderHandlerSettings;
    auxiliary?: aux.DiagramAuxiliary;
    makeSubTarget: (container: HTMLElement) => RenderTarget;
}

export type DiagramDecorator = (context: RenderedDiagram) => void;

export function make_render_target(
    container: HTMLElement,
    surface: HTMLElement = container,
    decorators: DiagramDecorator[] = [],
): RenderTarget {
    const html_renderer = new html_render.HTMLRenderHandler(container);
    const bc_renderer = new broadcasted_box.BroadcastedRenderer(html_renderer);
    /*
     * Everything is drawn as `Para` over the broadcast category, whether or
     * not the term has a parameter in it.
     *
     * `ParaCategoryRenderer` adds `Grab` and `Drop` and delegates the rest -
     * objects, seed morphisms, and the settings it draws them with - to the
     * renderer it wraps, so a term containing neither goes through exactly
     * the code that drew it before and comes out the same picture. Wrapping
     * unconditionally is what keeps that true: a renderer chosen per term
     * would have two paths to keep in agreement.
     */
    const renderer = new para.ParaCategoryRenderer(bc_renderer);

    /*
     * Whether the body of `morphism` was drawn by an earlier message, per
     * the `drawnBlockTags` the sender keeps. A body arrives here as the
     * `Block` a `BlockOperatorBox` made pending, so its tag is the tag of
     * that block; anything else pending is drawn.
     */
    function body_already_drawn(
        morphism: cat.BroadcastedCategory<any, any>,
    ): boolean {
        const drawn = html_renderer.settings.drawnBlockTags ?? [];
        return morphism instanceof cat.Block
            && drawn.includes(morphism.block_tag.uid._id);
    }

    function render_with_subblock(
        renderer: CategoryRenderer<any, any, any>,
        term: cat.BroadcastedCategory<any, any>,
        max_width: number,
    ): rh.DiagramElement {
        const main_element = mlc.render_root(renderer, term, max_width);

        // Popped even when they will not be drawn, so a suppressed render
        // does not leak its pending bodies into the next one.
        const block_morphisms = renderer.referencesHandler.pop_pending()
            .filter((morphism) => !body_already_drawn(morphism));
        if (!block_morphisms.length || html_renderer.settings.subBlocks === false) {
            return main_element;
        }
        const blocks = block_morphisms.map((morphism) =>
            render_with_subblock(renderer, morphism, max_width)
        );
        const vertical_blocks = new rh.Vertical(
            html_renderer,
            ut.join(
                () => new rh.CoreElement(html_renderer, {x: 10, y: 10}),
                blocks)
        );
        return new rh.Horizontal(
            html_renderer,
            ut.join(
                () => new rh.CoreElement(html_renderer, {x: 10, y: 10}),
                [vertical_blocks, main_element])
        )
    }

    /*
     * The two sides of a definition in one row with the `:=` between them.
     *
     * Each side is rendered by `render_with_subblock`, so a side holding a
     * `BlockOperator` keeps that block's body beside itself rather than in the
     * other side's column. `max_width` is the wrap width of the whole figure,
     * so each side wraps at half of what the glyph leaves of it.
     */
    function render_definition(
        renderer: CategoryRenderer<any, any, any>,
        definition: cat.DefinedExpression<any, any>,
        max_width: number,
    ): rh.DiagramElement {
        const glyph = new DefinitionGlyph(html_renderer);
        const side_width = Math.max(
            MINIMUM_DEFINITION_SIDE_WIDTH, (max_width - glyph.dims.x) / 2);
        const sides = definition.sides().map((side) => render_with_subblock(
            renderer, side as cat.BroadcastedCategory<any, any>, side_width));
        return new rh.Horizontal(
            html_renderer, [sides[0], glyph, sides[1]]);
    }

    /* The figure of whatever a message sent: a definition as its two sides,
     * and an expression as itself. */
    function render_figure(
        renderer: CategoryRenderer<any, any, any>,
        term: DiagramFigure,
        max_width: number,
    ): rh.DiagramElement {
        if (term instanceof cat.DefinedExpression) {
            return render_definition(renderer, term, max_width);
        }
        return render_with_subblock(renderer, term, max_width);
    }

    function termPass(
        term: DiagramFigure,
        settings: rhs.RenderHandlerSettings = rhs.defaultRenderHandlerSettings,
        auxiliary?: aux.DiagramAuxiliary,
    ): void {
        html_renderer.settings = settings;
        html_renderer.wipe();
        renderer.referencesHandler.clear_references();
        // The width is read per render rather than captured once, and it is
        // read after this pass's settings are installed on the handler.
        const diagram_element = render_figure(
            renderer, term, html_renderer.settings.width ?? WIDTH);
        html_renderer.add_child(diagram_element);
        html_renderer.post_placement();
        html_renderer.update();
        surface.style.backgroundColor = container.style.backgroundColor;
        surface.style.color = container.style.color;
        surface.ownerDocument.documentElement.style.colorScheme =
            DiagramTheme.colorScheme(settings);
        decorators.forEach((decorate) => decorate({
            container,
            renderHandler: html_renderer,
            renderer,
            term,
            settings,
            auxiliary,
            makeSubTarget: (sub_container: HTMLElement) =>
                make_render_target(sub_container, sub_container, decorators),
        }));
    }

    return {container, termPass};
}
