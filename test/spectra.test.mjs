import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../src/scripts/spectra.js';

const flat = s.GRID.map(() => 1);
const ones = s.GRID.map(() => 1);

test('GRID spans 380–780 nm in 5 nm steps', () => {
  assert.equal(s.GRID.length, 81);
  assert.equal(s.GRID[0], 380);
  assert.equal(s.GRID.at(-1), 780);
  for (let i = 1; i < s.GRID.length; i++) assert.equal(s.GRID[i] - s.GRID[i - 1], 5);
});

test('toGrid interpolates linearly between coarse samples', () => {
  const g = s.toGrid([380, 780], [0, 1]);
  assert.equal(g[0], 0);
  assert.ok(Math.abs(g[40] - 0.5) < 1e-9);
  assert.equal(g[80], 1);
});

test('full transmission renders white under any illuminant', () => {
  const warm = s.GRID.map((w) => (w - 370) / 410);
  for (const spd of [flat, warm]) assert.equal(s.spectrumColor(ones, spd).css, 'rgb(255, 255, 255)');
});

test('transmission follows Beer–Lambert: densities add and scale with thickness', () => {
  const d = s.GRID.map(() => 0.3);
  const once = s.transmission([[d, 1]], 2), twice = s.transmission([[d, 1], [d, 1]], 1);
  for (let i = 0; i < 81; i++) assert.ok(Math.abs(once[i] - twice[i]) < 1e-12);
  assert.ok(Math.abs(once[0] - 10 ** -0.6) < 1e-12);
});

test('glow: hotter is brighter and less red; the strength scale saturates at furnace heat', () => {
  const cool = s.glow(800 + 273.15), hot = s.glow(1150 + 273.15);
  assert.ok(hot.luminance > cool.luminance);
  assert.ok(Math.abs(hot.luminance - 1) < 0.01);
  assert.ok(hot.rgb[1] > cool.rgb[1]); // more green relative to red: orange rather than deep red
  assert.equal(s.glowStrength(hot.luminance), 1);
  assert.equal(s.glowStrength(s.glow(20 + 273.15).luminance), 0);
});

test('bandEdge absorbs above the gap and passes below it', () => {
  const T = s.bandEdge(2.1); // edge near 590 nm
  assert.ok(T[s.GRID.indexOf(450)] < 0.05);
  assert.ok(T[s.GRID.indexOf(700)] > 0.95);
});

test('dichroicBand blue-shifts as the angle increases', () => {
  assert.equal(Math.round(s.dichroicBand(0).center), 640);
  assert.ok(s.dichroicBand(60).center < s.dichroicBand(20).center);
});
