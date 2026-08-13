import * as dh from '../Render/DrawHandler';
import * as rh from '../Render/RenderHandler';

export class HTMLEventHandler extends rh.EventHandler<HTMLElement, SVGElement> {
    addHover(
        target: dh.DrawElement<HTMLElement, SVGElement>,
        funcIn: (arg: SVGElement) => void = () => {}, 
        funcOut: (arg: SVGElement) => void = () => {}
    ): void {
        const element = target.element;

        element.addEventListener('mouseover', (e) => {
            funcIn(element);
        });

        element.addEventListener('mouseleave', (e) => {
            funcOut(element);
        });
    }
}