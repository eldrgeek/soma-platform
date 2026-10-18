import assert from 'node:assert/strict';
import test from 'node:test';

import { parse, walk } from '../src/parser.js';

const validSource = `puppet "Dinner" version "0.2"
app "Dinner" {
  requires: signin
}
data guests {
  fields: [name, note]
}
screen "Home" {
  requires: signin
  text "{guests.count} coming"
  label "{me.name}"
  list "Guests" from guests
  table "Guest table" from guests
  field "Note"
  button "Join" @primary -> adds to guests { name: "{me.name}", note: "{form.Note}" }
  button "Leave" @danger -> removes from guests
}`;

test('parses v0.2 data, signin, collection elements, actions, and tokens', () => {
  const result = parse(validSource);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.sketch.data.guests, { fields: ['name', 'note'] });
  assert.equal(result.sketch.app.props.requires, 'signin');
  assert.equal(result.sketch.screens[0].props.requires, 'signin');

  const elements = walk(result.sketch.screens[0].children);
  assert.equal(elements.find((element) => element.kind === 'list').from, 'guests');
  assert.equal(elements.find((element) => element.kind === 'table').from, 'guests');
  assert.deepEqual(elements.find((element) => element.label === 'Join').hook[0], {
    type: 'add',
    target: 'guests',
    row: { name: '{me.name}', note: '{form.Note}' },
  });
  assert.deepEqual(elements.find((element) => element.label === 'Leave').hook[0], {
    type: 'remove',
    target: 'guests',
  });
});

test('refuses an unknown element kind', () => {
  const result = parse(validSource.replace('text "{guests.count} coming"', 'carousel "Guests"'));

  assert.match(result.errors[0].message, /Unknown element kind: carousel/);
});

test('refuses an unknown role', () => {
  const result = parse(validSource.replace('@primary', '@loud'));

  assert.match(result.errors[0].message, /Unknown role: @loud/);
});

test('refuses an unknown action', () => {
  const result = parse(validSource.replace('removes from guests', 'deletes guests'));

  assert.match(result.errors[0].message, /Unknown action: deletes guests/);
});

test('refuses undeclared collection and count names', () => {
  const result = parse(
    validSource
      .replace('from guests', 'from strangers')
      .replace('{guests.count}', '{strangers.count}'),
  );

  assert.ok(result.errors.some(({ message }) => message === 'Unknown collection: strangers'));
  assert.ok(result.errors.some(({ message }) => message === 'Unknown data: strangers'));
});

test('adds to refuses a field the data block does not declare', () => {
  const source = `puppet "X" version "0.2"
data seats {
  fields: [name]
}
screen "Home" {
  button "Go" @primary -> adds to seats { nope: "{me.name}" }
}`;
  const { errors } = parse(source);
  assert.ok(errors.some((e) => e.message === 'Undeclared field for seats: nope'), JSON.stringify(errors));
});
