export interface RenderHandlerSettings {
    darkMode?: boolean;
    debugBorders?: boolean;
    coreDebug?: boolean;
    /*
     * Width in px at which a morphism wraps onto another line, so that
     * `F_0; F_1 = F`. This is the diagram's aspect-ratio control: a narrower
     * width means more rows and a taller figure, a wider one fewer rows and a
     * flatter figure. Worth setting per figure - what suits a screen is rarely
     * what suits a column of a paper.
     */
    width?: number;
}
export const defaultRenderHandlerSettings: RenderHandlerSettings = {
    darkMode: false,
    debugBorders: false,
    coreDebug: false,
    width: 750,
}