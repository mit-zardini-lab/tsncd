// Claude Opus 5.5 (1M context), effort 40.
/*
 * The switch between the forms and the themes of a page's figure, which
 * `src/advanced_display/displaySelector.ts` holds. The tests cover the form and
 * the theme a page's own figure opens in, which the address alone decides with
 * the all-broadcasted form and the system's theme where it names neither, the
 * following of the system's theme until a theme is picked, a switch changing
 * the one setting it names, and the row of controls, whose first group is the
 * selector of variants and which `controls: hidden` hides whole.
 * `test/page_choices.test.ts` covers the address, which `pageChoices.ts` reads.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as display_selector from '../src/advanced_display/displaySelector.ts';
import * as page_choices from '../src/advanced_display/pageChoices.ts';
import * as rhs from '../src/display/Render/RenderHandlerSettings.ts';
import type * as drt from '../src/display/diagramRenderTarget';

const PAGE = 'https://example.org/figure.html';

const OWN: rhs.RenderHandlerSettings = {
    form: 'arrows-and-boxes', darkMode: false, controls: 'hidden', width: 900,
    title: 'Attention',
};

function requested_by(query: string): page_choices.AddressedChoice {
    return page_choices.choice_requested_by_address(`${PAGE}${query}`, []);
}

test('with no parameters the figure opens all-broadcasted in the system\'s theme',
     (): void => {
    assert.deepEqual(
        display_selector.settings_for_page(OWN, requested_by(''), true),
        {...OWN, form: 'all-broadcasted', darkMode: true});
    assert.deepEqual(
        display_selector.settings_for_page(OWN, requested_by(''), false),
        {...OWN, form: 'all-broadcasted', darkMode: false});
    assert.deepEqual(
        display_selector.settings_for_page(undefined, requested_by(''), true),
        {form: 'all-broadcasted', darkMode: true});
});

test('the address wins over the defaults, and a choice before a figure over both',
     (): void => {
    const requested = requested_by('?form=arrows-and-broadcasted&darkMode=false&controls=shown');

    assert.deepEqual(
        display_selector.settings_for_page(OWN, requested, true),
        {...OWN, form: 'arrows-and-broadcasted', darkMode: false, controls: 'shown'});
    assert.deepEqual(
        display_selector.settings_for_page(OWN, requested, true, {darkMode: true}),
        {...OWN, form: 'arrows-and-broadcasted', darkMode: true, controls: 'shown'});
});

test('a stored choice of form or theme is neither read nor written', async (): Promise<void> => {
    const trap = {
        getItem: (): never => assert.fail('The storage was read.'),
        setItem: (): never => assert.fail('The storage was written.'),
    };
    const held_storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {value: trap, configurable: true});
    try {
        assert.deepEqual(
            display_selector.settings_for_page(OWN, requested_by(''), true),
            {...OWN, form: 'all-broadcasted', darkMode: true});
        const {display_switch} = switch_over(
            {term: {} as drt.DiagramFigure, settings: {...rhs.defaultRenderHandlerSettings}});
        await display_switch.display({form: 'arrows-and-boxes', darkMode: false});
    } finally {
        if (held_storage === undefined) {
            Reflect.deleteProperty(globalThis, 'localStorage');
        } else {
            Object.defineProperty(globalThis, 'localStorage', held_storage);
        }
    }
});

test('the display mode the address asks for wins over the message\'s own', (): void => {
    const own: rhs.RenderHandlerSettings = {width: 900, displayMode: 'fast'};

    assert.equal(
        display_selector.settings_for_page(own, requested_by('?displayMode=slow'), true)
            .displayMode,
        'slow');
    assert.equal(
        display_selector.settings_for_page(own, requested_by(''), true).displayMode, 'fast');
});

/* A `MediaQueryList` whose answer the test sets, and which tells its
 * listeners when the answer changes. */
class HeldSystemTheme extends EventTarget {
    constructor(public matches: boolean) {
        super();
    }

    change_to(dark: boolean): void {
        this.matches = dark;
        this.dispatchEvent(new Event('change'));
    }
}

test('the system\'s theme is followed while no theme is picked', (): void => {
    const system = new HeldSystemTheme(true);
    const redrawn: boolean[] = [];
    const follower = display_selector.follow_system_theme(
        system, true, (dark_mode) => redrawn.push(dark_mode));

    assert.equal(display_selector.system_dark_mode(system), true);
    system.change_to(false);
    system.change_to(true);
    assert.deepEqual(redrawn, [false, true]);
    assert.equal(follower.following(), true);

    follower.stop();
    system.change_to(false);
    assert.deepEqual(redrawn, [false, true]);
    assert.equal(follower.following(), false);
});

test('an address naming a theme is not followed by the system\'s theme', (): void => {
    const system = new HeldSystemTheme(false);
    const redrawn: boolean[] = [];

    display_selector.follow_system_theme(system, false, (dark_mode) => redrawn.push(dark_mode));
    system.change_to(true);

    assert.deepEqual(redrawn, []);
    assert.equal(display_selector.system_dark_mode(undefined), true);
});

interface Redraw {
    term: drt.DiagramFigure;
    settings?: rhs.RenderHandlerSettings;
    auxiliary?: unknown;
}

/* A switch over a page holding `held`, whose redraws are recorded, and which
 * counts how often it waited for the page to settle. */
function switch_over(held: display_selector.HeldFigure | undefined): {
    display_switch: display_selector.DisplaySwitch;
    redraws: Redraw[];
    settled: () => number;
} {
    const redraws: Redraw[] = [];
    let settles = 0;
    const display_switch = display_selector.make_display_switch({
        held: () => held,
        redraw: (term, settings, auxiliary) => {
            redraws.push({term, settings, auxiliary});
        },
        settled: async (): Promise<void> => {
            settles += 1;
        },
    });
    return {display_switch, redraws, settled: () => settles};
}

test('a switch draws the held term again with the one setting it names',
     async (): Promise<void> => {
    const term = {} as drt.DiagramFigure;
    const auxiliary = {axes: []};
    const settings: rhs.RenderHandlerSettings = {
        ...rhs.defaultRenderHandlerSettings,
        form: 'all-broadcasted', darkMode: true, width: 900, legend: true,
        inspectionBoxes: true, title: 'Attention', controls: 'shown',
    };
    const {display_switch, redraws, settled} = switch_over(
        {term, settings, auxiliary: auxiliary as never});

    await display_switch.display({form: 'arrows-and-boxes'});
    await display_switch.display({darkMode: false});

    assert.equal(redraws.length, 2);
    assert.ok(redraws.every((redraw) => redraw.term === term));
    assert.ok(redraws.every((redraw) => redraw.auxiliary === auxiliary));
    assert.deepEqual(redraws[0].settings, {...settings, form: 'arrows-and-boxes'});
    assert.deepEqual(redraws[1].settings, {...settings, darkMode: false});
    assert.equal(settled(), 2);
});

test('a switch ignores a field holding no value its setting takes',
     async (): Promise<void> => {
    const term = {} as drt.DiagramFigure;
    const settings = {...rhs.defaultRenderHandlerSettings};
    const {display_switch, redraws} = switch_over({term, settings});

    await display_switch.display(
        {form: 'arrows' as rhs.DiagramForm, darkMode: 'no' as unknown as boolean});

    assert.deepEqual(redraws[0].settings, settings);
});

test('a switch before the page holds a figure is kept for its own message',
     async (): Promise<void> => {
    const {display_switch, redraws, settled} = switch_over(undefined);

    await display_switch.display({form: 'arrows-and-boxes'});
    await display_switch.display({darkMode: false});

    assert.equal(redraws.length, 0);
    assert.equal(settled(), 0);
    assert.deepEqual(
        display_switch.chosen_before_a_figure(),
        {form: 'arrows-and-boxes', darkMode: false});
});

test('the buttons name the three forms and the two themes', (): void => {
    assert.deepEqual(
        rhs.DIAGRAM_FORMS.map((form) => display_selector.FORM_BUTTON_NAMES[form]),
        ['Arrows and boxes', 'Arrows and broadcasted', 'All broadcasted']);
    assert.deepEqual(
        display_selector.THEME_BUTTON_NAMES,
        [{name: 'Light', darkMode: false}, {name: 'Dark', darkMode: true}]);
    assert.equal(rhs.defaultRenderHandlerSettings.controls, 'hidden');
});

/*
 * A document holding the few parts of the DOM the row of controls touches:
 * elements with children, a style, attributes, a text and a class, and the
 * insertion of an element after another.
 */
class HeldElement {
    readonly children: HeldElement[] = [];
    parent: HeldElement | undefined;
    readonly style: Record<string, string> = {};
    readonly attributes = new Map<string, string>();
    className = '';
    textContent = '';
    type = '';

    constructor(readonly tagName: string, readonly ownerDocument: HeldDocument) {}

    appendChild(child: HeldElement): HeldElement {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    addEventListener(): void {
        return;
    }

    insertAdjacentElement(position: string, element: HeldElement): HeldElement {
        assert.equal(position, 'afterend');
        const siblings = this.parent?.children ?? [];
        siblings.splice(siblings.indexOf(this) + 1, 0, element);
        element.parent = this.parent;
        return element;
    }
}

class HeldDocument {
    createElement(tagName: string): HeldElement {
        return new HeldElement(tagName, this);
    }
}

function page_with_heading(): {body: HeldElement; heading: HeldElement; selector: HeldElement} {
    const page = new HeldDocument();
    const body = page.createElement('body');
    const heading = body.appendChild(page.createElement('h1'));
    body.appendChild(page.createElement('div'));
    return {body, heading, selector: page.createElement('details')};
}

test('the selector of variants is the first group of the row of the form and the theme',
     (): void => {
    const {body, heading, selector} = page_with_heading();
    const target: drt.RenderTarget = {
        container: {} as HTMLElement,
        termPass: (): void => undefined,
    };

    display_selector.with_display_controls(
        target, heading as unknown as HTMLElement, async (): Promise<void> => undefined,
        selector as unknown as HTMLElement);

    const row = body.children[1];
    assert.equal(row.className, 'display-selector');
    assert.equal(row.style.flexWrap, 'wrap');
    assert.equal(row.children[0], selector);
    assert.deepEqual(
        row.children.slice(1).map((group) => group.attributes.get('aria-label')),
        ['Form', 'Theme']);
});

test('the row, the selector of variants with it, is hidden under controls: hidden',
     (): void => {
    const {body, heading, selector} = page_with_heading();
    const drawn: (rhs.RenderHandlerSettings | undefined)[] = [];
    const controlled = display_selector.with_display_controls(
        {
            container: {} as HTMLElement,
            termPass: (_term, settings): void => {
                drawn.push(settings);
            },
        },
        heading as unknown as HTMLElement, async (): Promise<void> => undefined,
        selector as unknown as HTMLElement);
    const row = body.children[1];
    const term = {} as drt.DiagramFigure;

    assert.equal(row.style.display, 'none');
    controlled.termPass(term, {controls: 'shown'});
    assert.equal(row.style.display, 'flex');
    controlled.termPass(term, {controls: 'hidden'});
    assert.equal(row.style.display, 'none');
    controlled.termPass(term, {});
    assert.equal(row.style.display, 'none');
    assert.equal(selector.parent, row);
    assert.equal(drawn.length, 3);
});

test('a row drawn without a selector holds the form and the theme alone', (): void => {
    const {body, heading} = page_with_heading();

    display_selector.with_display_controls(
        {container: {} as HTMLElement, termPass: (): void => undefined},
        heading as unknown as HTMLElement, async (): Promise<void> => undefined);

    assert.deepEqual(
        body.children[1].children.map((group) => group.attributes.get('aria-label')),
        ['Form', 'Theme']);
});
