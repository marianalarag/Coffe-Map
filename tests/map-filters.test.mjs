import test from 'node:test';
import assert from 'node:assert/strict';
import { CAFE_CHAINS, getCafeChain, isCafeVisibleWithChains } from '../src/utils/cafeChains.js';
import { clampPanelPosition } from '../src/utils/mapPanelPosition.js';

test('recognizes branch names, case, punctuation and common Tim Hortons spelling', () => {
  for (const name of ['STARBUCKS Altabrisa', 'Starbucks® Montejo', 'Star Bucks Centro']) assert.equal(getCafeChain({ nombre: name }), 'starbucks');
  for (const name of ['The Italian Coffee Company - Centro', 'Italian Coffee Mérida']) assert.equal(getCafeChain({ nombre: name }), 'italian-coffee');
  for (const name of ['Tim Hortons', 'Tim Hourtons - Mérida', 'TIM HORTON’S', 'TimHortons']) assert.equal(getCafeChain({ nombre: name }), 'tim-hortons');
});

test('local names are not excluded just for generic coffee words', () => {
  for (const name of ['Al Taglio Pizza & Caffe', 'Italian Bakery', 'Coffee House', 'Alma Cálida', 'Arista Barista', 'Timoteo Café']) {
    assert.equal(isCafeVisibleWithChains({ nombre: name }, CAFE_CHAINS.map((chain) => chain.id)), true);
  }
});

test('T Bar hides every named branch without hiding similarly named local cafes', () => {
  for (const nombre of ['T Bar', 'T-Bar Altabrisa', 'T BAR - Centro', 'Tbar Montejo', 'T.Bar City Center']) {
    assert.equal(getCafeChain({ nombre }), 't-bar');
    assert.equal(isCafeVisibleWithChains({ nombre }, ['t-bar']), false);
    assert.equal(isCafeVisibleWithChains({ nombre }, []), true);
  }
  for (const nombre of ['Art Bar', 'T Barista', 'Cielito Querido']) assert.equal(getCafeChain({ nombre }), null);
  assert.equal(isCafeVisibleWithChains({ nombre: 'Sucursal Norte', brand: 'T Bar' }, ['t-bar']), false);
  assert.equal(CAFE_CHAINS.some((chain) => chain.id === 'cielito-querido'), false);
});

test('chain choices are independent and reversible and do not mutate cafe data', () => {
  const cafes = [{ nombre: 'Starbucks Centro' }, { nombre: 'Italian Coffee' }, { nombre: 'Tim Hortons' }, { nombre: 'Agua de Menta' }];
  const original = structuredClone(cafes);
  assert.equal(cafes.filter((cafe) => isCafeVisibleWithChains(cafe, ['starbucks'])).length, 3);
  assert.deepEqual(cafes.filter((cafe) => isCafeVisibleWithChains(cafe, CAFE_CHAINS.map((chain) => chain.id))), [cafes[3]]);
  assert.equal(cafes.filter((cafe) => isCafeVisibleWithChains(cafe, [])).length, 4);
  assert.deepEqual(cafes, original);
  assert.equal(getCafeChain({ nombre: 'Sucursal Altabrisa', brand: 'Starbucks' }), 'starbucks');
  assert.equal(getCafeChain({ nombre: null }), null);
});

test('dragging keeps the whole panel inside the viewport, including after resizing', () => {
  const panel = { width: 370, height: 500 };
  assert.deepEqual(clampPanelPosition({ x: 400, y: 180 }, panel, { width: 1200, height: 800 }), { x: 400, y: 180 });
  assert.deepEqual(clampPanelPosition({ x: -500, y: -500 }, panel, { width: 1200, height: 800 }), { x: 8, y: 8 });
  assert.deepEqual(clampPanelPosition({ x: 1500, y: 1000 }, panel, { width: 800, height: 600 }), { x: 422, y: 92 });
  assert.deepEqual(clampPanelPosition({ x: 600, y: 800 }, panel, { width: 300, height: 200 }), { x: 8, y: 8 });
});
