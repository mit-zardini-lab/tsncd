import * as rh from '../Render/RenderHandler';
import { HTMLDrawHandler } from './HTMLDrawHandler';
import { HTMLEventHandler } from './HTMLEventHandler';
import * as dh from '../draw_helper/draw_helpers';
import {Point, Rectangle} from '../../utilities/Point';
import { HTMLAnnotationHandler } from './HTMLAnnotationHandler';
import * as html_helpers from './html_helpers';
import katex from 'katex';
import { AnnotationElement } from '../Render/RenderHandler';
import { DrawElement } from '../Render/DrawHandler';

function px_string_to_number(value: string): number {
    return parseFloat(value.replace('px', ''));
}

function px_number_to_string(value: number | undefined): string {
    return value !== undefined ? `${value}px` : 'auto';
}

export function processLatex(annotation: rh.AnnotationElement) {
    const element = annotation.renderHandler.get_rendered(annotation);
    katex.render(
        annotation.latex, 
        element,
        {throwOnError: false}
    );
    //element.style.zIndex = '999';
}

export class HTMLRenderHandler extends rh.RenderHandler<HTMLElement> {

    public annotation_handler: HTMLAnnotationHandler;
    constructor(
        private parent: HTMLElement,
    ) {
        super();
        this.annotation_handler = new HTMLAnnotationHandler(
            this, this.parent as HTMLDivElement);
        this.draw_handler = new HTMLDrawHandler(
            this.parent as HTMLDivElement);
        this.event_handler = new HTMLEventHandler(this);
    }

    public wipe(): void {
        this.parent.innerHTML = '';
        this.annotation_handler = new HTMLAnnotationHandler(
            this, this.parent as HTMLDivElement);
        this.draw_handler = new HTMLDrawHandler(
            this.parent as HTMLDivElement);
        this.diagram_elements = {};
        this.diagram_rendered = {};
        this.primary_children = [];
    }

    protected _element_to_rendered(target: rh.DiagramElement): HTMLElement {
        if (target.diagram_id in this.diagram_rendered) {
            return this.diagram_rendered[target.diagram_id];
        }
        const element = dh.new_element('horizontal-box');
        switch (target.constructor.name) {
            // case rh.AnnotationElement.name:
            //     processLatex(target as rh.AnnotationElement);
            //     break;
            case rh.Vertical.name:
                element.className = 'vertical-box';
                break;
            case rh.CoreElement.name:
                element.className = 'fill';
                break;
        }
        element.append(...target.children.map((x) => this.element_to_rendered(x)));
        element.style.width = target.dims.x !== undefined ? `${target.dims.x}px` : 'auto';
        element.style.height = target.dims.y !== undefined ? `${target.dims.y}px` : 'auto';
        this.diagram_rendered[target.diagram_id] = element;
        this.applyAux(target);
        target.set_transform();
        // this.event_handler?.addHover(
        //     target,
        //     (e) => {console.log('hello');},
        //     (e) => {}
        // );
        return element;
    }

    protected _parent_location(target: rh.DiagramElement): Point {
        const parent_element = this.parent;;
        const rect = parent_element.getBoundingClientRect();
        return {x: rect.left, y: rect.top};
    }

    public location(target: rh.DiagramElement): Point {
        return this.rectangle(target).midpoint();
    }

    public text_rectangle(target: rh.AnnotationElement, relative: boolean = false): Rectangle {
        return this.annotation_handler.text_rectangle(target, relative);
    }

    public rectangle(target: rh.DiagramElement, relative: boolean = false): Rectangle {
        return html_helpers.bound_to_rect(
            this.get_rendered(target),
            this.parent
        );
    }

    public set_transform(target: rh.DiagramElement): void {
        if (!(target.diagram_id in this.diagram_rendered)) {
            return;
        }
        const rendered = this.get_rendered(target);
        const transform = target.transform;
        const rect_hw = {
            x: px_string_to_number(rendered.style.width),
            y: px_string_to_number(rendered.style.height)
        }
        const offset = {
            x: transform.offset.x + transform.positioning.x! * rect_hw.x,
            y: transform.offset.y + transform.positioning.y! * rect_hw.y,
        }
        let transform_str = `
            translate(${offset.x}px, ${offset.y}px)`;
        rendered.style.transform = transform_str;
    }

    protected _add_child(target: rh.DiagramElement): void {
        this.parent.appendChild(this.element_to_rendered(target));
    }

    protected applyAux(target: rh.DiagramElement): void {
        const rendered = this.get_rendered(target);
        if (this.settings.debugBorders && target.aux.borderColor){
            rendered.style.borderColor = target.aux.borderColor;
            rendered.style.boxSizing = 'border-box';
            rendered.style.borderStyle = 'solid';
            rendered.style.borderWidth = '1px';
        }
        else if (this.settings.coreDebug && target.aux.borderColor && target.aux.core) {
            rendered.style.borderColor = target.aux.borderColor;
            rendered.style.boxSizing = 'border-box';
            rendered.style.boxSizing = 'border-box';
            rendered.style.borderStyle = 'solid';
            rendered.style.borderWidth = '1px';
        }
    }

    public remove_element(target: rh.DiagramElement): void {
        if (target.diagram_id in this.diagram_rendered) {
            const element = this.diagram_rendered[target.diagram_id];
            element.remove();
            delete this.diagram_rendered[target.diagram_id];
        }
    }

    public getMain(target: rh.DiagramElement | DrawElement<HTMLElement, SVGElement>): SVGElement | HTMLElement {
        if (target instanceof rh.DiagramElement) {
            return this.get_rendered(target);
        }
        else {
            return target.element;
        }
    }
}