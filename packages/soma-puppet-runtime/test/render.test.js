import assert from 'node:assert/strict';
import test from 'node:test';

import { interpolate, mapFormToRow } from '../src/render.js';

test('interpolate resolves the signed-in person and live collection counts', () => {
  assert.equal(
    interpolate('Hello {me.name}: {seats.count} coming', {
      me: { name: 'Theo' },
      data: { seats: [{ id: 'r1' }, { id: 'r2' }] },
    }),
    'Hello Theo: 2 coming',
  );
});

test('interpolate leaves unsupported tokens visible', () => {
  assert.equal(interpolate('Hello {member.name}', {}), 'Hello {member.name}');
});

test('mapFormToRow fills form labels and me.name without changing literals', () => {
  assert.deepEqual(
    mapFormToRow(
      {
        who: '{me.name}',
        dish: '{form.Dish}',
        cant_eat: "{form.Can't eat}",
        status: 'offered',
      },
      { Dish: 'Beans', "Can't eat": 'Peanuts' },
      { name: 'Theo' },
    ),
    {
      who: 'Theo',
      dish: 'Beans',
      cant_eat: 'Peanuts',
      status: 'offered',
    },
  );
});
