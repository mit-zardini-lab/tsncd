// Rewritten by Claude Opus 5.5 (1M context), effort 40, on 2026-09-27, for the
// rule that the address and the system's theme alone choose the first theme.
/*
 * The script in the head of `public/index.html` that chooses the theme a page is
 * painted in before the bundle runs, so a light page never shows a dark frame.
 * It is run here with the globals it may read standing in for the browser's,
 * and with a storage and a meta element that it must not read.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = /<head>[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(page)?.[1] ?? '';

interface Page {
    query?: string;
    system?: 'dark' | 'light' | 'unanswered';
    stored?: string;
    written?: string;
}

/* The theme the script marks the page with, `light` or none for dark. */
function theme_of({query = '', system = 'dark', stored, written}: Page): string | undefined {
    const marks = new Map<string, string>();
    const location = {search: query};
    const matchMedia = (media: string): {matches: boolean} => {
        if (system === 'unanswered') {
            throw new Error('The browser answers no media query.');
        }
        assert.equal(media, '(prefers-color-scheme: dark)');
        return {matches: system === 'dark'};
    };
    const localStorage = {
        getItem: (key: string): string | null => key === 'tsncd-dark-mode' ? stored ?? null : null,
    };
    const document = {
        querySelector: (selector: string) =>
            selector === 'meta[name="tsncd-dark-mode"]' && written !== undefined
                ? {getAttribute: (name: string) => name === 'content' ? written : null}
                : null,
        documentElement: {
            setAttribute: (name: string, value: string): void => { marks.set(name, value); },
        },
    };
    new Function('location', 'matchMedia', 'localStorage', 'document', script)(
        location, matchMedia, localStorage, document);
    return marks.get('data-tsncd-theme');
}

test('the head of the page holds the script', (): void => {
    assert.match(script, /prefers-color-scheme: dark/);
});

test('a page whose address names no theme is painted in the system\'s theme', (): void => {
    assert.equal(theme_of({system: 'light'}), 'light');
    assert.equal(theme_of({system: 'dark'}), undefined);
    assert.equal(theme_of({system: 'unanswered'}), undefined);
});

test('the address wins over the system\'s theme', (): void => {
    assert.equal(theme_of({query: '?darkMode=false', system: 'dark'}), 'light');
    assert.equal(theme_of({query: '?darkMode=true', system: 'light'}), undefined);
    assert.equal(theme_of({query: '?darkMode=maybe', system: 'light'}), 'light');
});

test('a stored choice and the theme the page was written in are not read', (): void => {
    assert.equal(theme_of({system: 'dark', stored: 'false', written: 'false'}), undefined);
    assert.equal(theme_of({system: 'light', stored: 'true', written: 'true'}), 'light');
});
