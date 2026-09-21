/*
 * The relay server, and the counterpart of `pyncd`'s `run_server.py`.
 *
 *     npm run server
 *
 * Node runs this file's TypeScript directly, so there is no build step and
 * nothing in `dist/` is involved. Only one of the two servers may hold port
 * 8765. Either will do. No client can tell which one is up.
 */

import * as diagram_server from './data_transfer/diagram_server.ts';

const relay_server = new diagram_server.DiagramServer();

relay_server.serve_clients().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
