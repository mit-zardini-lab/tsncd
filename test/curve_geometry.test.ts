import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as Curve from '../src/utilities/Curve';

test('a cubic arrow uses the actual midpoint and tangent of the SVG curve', (): void => {
    const curve = new Curve.CubicBezierCurve(
        {x: 0, y: 0}, {x: 40, y: 0}, {x: 60, y: 80}, {x: 100, y: 80});
    const midpoint = curve.midpoint();
    assert.deepEqual(midpoint.point, {x: 50, y: 40});
    assert.equal(midpoint.angle, Math.atan2(160, 120));
});

test('vertical and reverse wires have finite arrow positions and travel direction', (): void => {
    const straight = new Curve.StraightLine({x: 5, y: 10}, {x: 5, y: 90});
    assert.deepEqual(straight.midpoint(), {point: {x: 5, y: 50}, angle: Math.PI / 2});
    const reverse = new Curve.StraightLine({x: 40, y: 10}, {x: 0, y: 10});
    assert.equal(reverse.midpoint().angle, Math.PI);
    const vertical = Curve.verticalCurve({x: 0, y: 0}, {x: 40, y: 100});
    assert.deepEqual(vertical.midpoint().point, {x: 20, y: 50});
    assert.equal(vertical.midpoint().angle, Math.atan2(120, 80));
});
