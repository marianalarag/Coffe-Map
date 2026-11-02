import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCafeTime, getCafeOpenStatus, getCafeScheduleRows } from '../src/utils/cafeHours.js';

test('hours display am and pm while stored times remain in 24-hour format', () => {
  assert.equal(formatCafeTime('00:00'), '12:00 am');
  assert.equal(formatCafeTime('08:30'), '8:30 am');
  assert.equal(formatCafeTime('12:00'), '12:00 pm');
  assert.equal(formatCafeTime('22:00'), '10:00 pm');
  assert.equal(formatCafeTime('24:00'), '12:00 am');
  const schedule = 'Mo 08:30-13:00,17:00-22:00; Tu off';
  assert.equal(getCafeScheduleRows(schedule)[0].hours, '8:30 am – 1:00 pm, 5:00 pm – 10:00 pm');
  assert.equal(getCafeScheduleRows(schedule)[1].hours, 'Cerrado');
  assert.equal(schedule, 'Mo 08:30-13:00,17:00-22:00; Tu off');
});
test('open status capitalizes Cierra and uses a 12-hour closing time', () => {
  assert.equal(getCafeOpenStatus('Mo-Su 08:00-22:00', new Date('2026-11-02T16:00:00Z')).label, 'Abierto · Cierra 10:00 pm');
  assert.equal(getCafeOpenStatus('24/7').label, 'Abierto 24 horas');
  assert.equal(getCafeScheduleRows('24/7')[0].hours, '24 horas');
});
