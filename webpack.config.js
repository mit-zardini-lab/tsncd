import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import HtmlWebpackPlugin from "html-webpack-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * The figure the page draws when no sender has chosen one, written into
 * `dist/` at the path the page fetches it from.
 *
 * The message is served as a file rather than imported, because it runs to
 * 13 MB and an import writes every byte of it into the bundle, where webpack
 * parses it on each build and the browser parses it before the renderer runs.
 * `src/data_transfer/boot_message.ts` holds the path and `PROTOCOL.md` states
 * it under *The figure a page boots with*. The dev server serves whatever the
 * compilation emits, so the same file answers under `npm run dev`.
 */
const BOOT_MESSAGE_PATH = "json_files/deepseek_v41_flash_text_only_quantised.json";
const BOOT_MESSAGE_SOURCE = path.resolve(
  __dirname, "public", ...BOOT_MESSAGE_PATH.split("/"));

const emitBootMessage = {
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap("EmitBootMessage", (compilation) => {
      compilation.fileDependencies.add(BOOT_MESSAGE_SOURCE);
      compilation.hooks.processAssets.tapPromise({
        name: "EmitBootMessage",
        stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
      }, async () => {
        compilation.emitAsset(
          BOOT_MESSAGE_PATH,
          new sources.RawSource(
            await fs.promises.readFile(BOOT_MESSAGE_SOURCE)));
      });
    });
  },
};

export default {
  entry: path.resolve(__dirname, "src", "index.ts"),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "assets/[name].[contenthash].js",
    clean: true,
    publicPath: "/"
  },

  resolve: {
    extensions: [".ts", ".tsx", ".js"]
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      /*
       * KaTeX's fonts are written into the bundle as data URIs, so the bundle
       * requests no file once it has loaded. `pyncd`'s
       * `websocket_transfer/standalone_page.py` depends on that to write a
       * figure as one HTML file that opens from `file://` with no network.
       * KaTeX's stylesheet lists each face as woff2, woff and ttf in that
       * order, and a browser takes the first format it reads. Every browser
       * that runs this bundle reads woff2, so the other two are written as
       * empty data URIs and add nothing to the bundle.
       */
      {
        test: /\.woff2$/,
        type: 'asset/inline',
      },
      {
        test: /\.(woff|ttf|eot)$/,
        type: 'asset/inline',
        generator: {
          dataUrl: () => 'data:,',
        },
      },
    ]
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "public", "index.html")
    }),
    emitBootMessage
  ],

  devtool: "source-map",

  devServer: {
    /*
     * The dev server serves its in-memory bundle ahead of `dist/`, so a change
     * in `dist/` shows nothing new. `npm run watch` writes `dist/` while the
     * dev server runs, and a watched `dist/` would reload the page after every
     * production build.
     */
    static: {
      directory: path.resolve(__dirname, "dist"),
      watch: false
    },
    port: 3000,
    open: true,
    hot: true,
    historyApiFallback: true
  }
};
