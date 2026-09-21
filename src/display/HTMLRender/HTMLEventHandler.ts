import * as dh from '../Render/DrawHandler';
import * as rh from '../Render/RenderHandler';

export function svg_hover_pointer_events(tagName: string): 'visibleStroke' | 'all' {
    return tagName.toLowerCase() === 'path' ? 'visibleStroke' : 'all';
}

export class HTMLEventHandler extends rh.EventHandler<HTMLElement, SVGElement> {
    addHover(
        target: dh.DrawElement<HTMLElement, SVGElement> | rh.AnnotationElement,
        funcIn: (arg: HTMLElement | SVGElement) => void = () => {},
        funcOut: (arg: HTMLElement | SVGElement) => void = () => {},
    ): void {
        const element = this.renderHandler.getMain(target);
        element.style.pointerEvents = element instanceof SVGElement
            ? svg_hover_pointer_events(element.tagName)
            : 'auto';

        element.addEventListener('mouseenter', (e) => {
            funcIn(element);
        });

        element.addEventListener('mouseleave', (e) => {
            funcOut(element);
        });
    }

    addClick(
        target: dh.DrawElement<HTMLElement, SVGElement> | rh.AnnotationElement,
        func: (arg: HTMLElement | SVGElement) => void = () => {},
    ): void {
        const element = this.renderHandler.getMain(target);
        element.style.pointerEvents = element instanceof SVGElement
            ? svg_hover_pointer_events(element.tagName)
            : 'auto';
        element.style.cursor = 'pointer';

        element.addEventListener('click', (event) => {
            event.stopPropagation();
            func(element);
        });
    }
}
