import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND'
                || !specifier.startsWith('.')
                || /\.[a-z]+$/i.test(specifier)) {
                throw error;
            }
            return nextResolve(`${specifier}.ts`, context);
        }
    },
    load(url, context, nextLoad) {
        if (!url.endsWith('.ts') || url.includes('/node_modules/')) {
            return nextLoad(url, context);
        }
        const source = readFileSync(new URL(url), 'utf8');
        return {
            format: 'module',
            shortCircuit: true,
            source: ts.transpileModule(source, {
                compilerOptions: {
                    target: ts.ScriptTarget.ES2022,
                    module: ts.ModuleKind.ESNext,
                    useDefineForClassFields: false,
                },
                fileName: new URL(url).pathname,
            }).outputText,
        };
    },
});
