/*
 * Webpack resolves these through `css-loader`/`style-loader`; `tsc` needs
 * telling that they are importable at all.
 */
declare module '*.css';
