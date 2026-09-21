import * as rh from '../Render/RenderHandler';
import * as pt from '../../utilities/Point';
import * as ah from '../Render/AnnotationHandler';
import * as dh from '../draw_helper/draw_helpers';
import * as html_helpers from './html_helpers';
import * as DiagramTheme from '../Render/DiagramTheme';

/*
 * Bundled rather than pulled from a CDN, because image capture depends on it.
 * `html-to-image` inlines `@font-face` rules by reading `cssRules`, and the
 * browser refuses that read on a cross-origin stylesheet - so a CDN KaTeX
 * silently captures in a fallback face, which (since the overlay is drawn from
 * measured text boxes) moves the wires, not just the glyphs. Webpack's
 * `css-loader` plus the font asset rule serve the faces same-origin.
 */
import 'katex/dist/katex.min.css';
import katex from 'katex';
import {KATEX_OPTIONS} from './katex_options';
const RELATIVE: boolean = true

/*
 * `justify-content: left | right` are the newer Box Alignment keywords and are
 * not universally honoured; the flex ones are. Written out so that asking for
 * `horizontal_align: 'right'` is a right-aligned annotation everywhere rather
 * than a dropped declaration that silently falls back to the start edge.
 */
const JUSTIFY_CONTENT: Record<rh.AnnotationElementSettings['horizontal_align'], string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
};

export function new_background(parent: HTMLElement): HTMLDivElement {
    const bg = dh.new_element('stack_annotations', parent);
    const rect = parent.getBoundingClientRect();

    bg.style.width = `${rect.width}px`;
    bg.style.height = `${rect.height}px`;
    parent.appendChild(bg);
    return bg;
}

/* The glow a label shows while the highlight it carries is active. */
export function label_halo(color: string): string {
    return `0 0 2px ${color}, 0 0 6px ${color}`;
}

export class HTMLAnnotationHandler extends ah.AnnotationHandler {
    private annotations: rh.AnnotationElement[] = [];
    private container?: HTMLDivElement;
    /* The release of the halo handler each placed label registered, so a
     * label placed twice in one pass leaves one handler behind. */
    private halo_releases = new WeakMap<rh.AnnotationElement, () => void>();
    constructor(
        private renderHandler: rh.RenderHandler<HTMLElement>,
        private parent: HTMLDivElement,
    ) {
        super();
    }
    update(): void {
        if (this.container) {
            this.container.remove();
        }
        this.container = new_background(this.parent);
        console.log('updating annotations');
    }
    addAnnotation(rectangle: pt.Rectangle, annotation: rh.AnnotationElement): void {
        const annotationSettings = DiagramTheme.adaptAnnotationSettings(
            annotation.annotationSettings, this.renderHandler.settings);
        const element = dh.new_element('annotation_katex');
        element.style.left = `${rectangle.top_left.x}px`;
        element.style.top =  `${rectangle.top_left.y}px`;
        element.style.width =  `${rectangle.dims.x}px`;
        element.style.height = `${rectangle.dims.y}px`;
        element.style.fontSize = `${annotationSettings.font_size}em`;
        element.style.alignItems = annotationSettings.vertical_align || 'center';
        element.style.justifyContent = JUSTIFY_CONTENT[
            annotationSettings.horizontal_align] || 'center';
        if (annotationSettings.background) {
            element.style.background = annotationSettings.background;
        }
        if (annotationSettings.rotation) {
            element.style.transform = `rotate(${annotationSettings.rotation}deg)`;
        }
        this.container?.appendChild(element);

        const prepend = annotationSettings.color ? `\\color{${annotationSettings.color}} ` : '';
        katex.render(
            `${prepend}${annotation.latex}`,
            element,
            {...KATEX_OPTIONS, output: 'html'}
        );
        this.renderHandler.diagram_rendered[annotation.diagram_id] = element;
        this.link_highlights(annotation, element, annotationSettings.color);
    }
    /*
     * Show the label's halo while its `halo_token` is active, and set every
     * `hover_tokens` entry while the pointer rests on the label. The listeners
     * belong to the element made for this placement, and a later placement of
     * the same label makes a new element and links it afresh.
     */
    private link_highlights(
        annotation: rh.AnnotationElement,
        element: HTMLDivElement,
        color: string | undefined,
    ): void {
        this.halo_releases.get(annotation)?.();
        this.halo_releases.delete(annotation);
        if (annotation.halo_token !== undefined) {
            const halo = label_halo(color ?? (this.parent.style.color || 'black'));
            this.halo_releases.set(annotation, this.renderHandler.register_highlight(
                annotation.halo_token,
                (active) => { element.style.textShadow = active ? halo : ''; }));
        }
        if (annotation.hover_tokens.length === 0) {
            return;
        }
        const tokens = [...annotation.hover_tokens];
        const source = annotation.diagram_id;
        this.renderHandler.event_handler?.addHover(
            annotation,
            () => tokens.forEach(
                (token) => this.renderHandler.set_highlight(token, source, true)),
            () => tokens.forEach(
                (token) => this.renderHandler.set_highlight(token, source, false)));
    }
    removeAnnotation(annotation: rh.AnnotationElement): void {
        const index = this.annotations.indexOf(annotation);
        if (index === -1) {
            throw new Error("Annotation not found in handler.");
        }
        delete this.annotations[index];
        this.renderHandler.remove_element(annotation);
    }
    text_rectangle(target: rh.AnnotationElement, relative: boolean = false): pt.Rectangle {
        const element = this.renderHandler.get_rendered(target);
        return html_helpers.bound_to_rect(
            element.children[0] as HTMLElement,
            this.parent
        );
    }
}
