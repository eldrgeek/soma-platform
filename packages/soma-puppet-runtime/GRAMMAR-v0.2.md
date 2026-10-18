# Puppet Script grammar v0.2 delta

This is the minimal runtime-data delta from
[`GRAMMAR-v0.1.md`](./GRAMMAR-v0.1.md). Everything not changed here keeps its
v0.1 meaning, including the closed sets of element kinds, roles, and actions.

- The metadata version may be `"0.2"`.
- `data Name { fields: [field, ...] }` declares a persisted collection. `stub`
  remains available for non-persisted sketches.
- `list` and `table` may use either a declared `data` or `stub` name after
  `from`.
- `adds to Name { field: "value", ... }` appends to declared data. Values may
  interpolate `{me.name}` or `{form.Field label}`.
- `removes from Name` removes the row to which the triggering element is
  bound.
- `requires: signin` may appear in an `app` or `screen`.
- Element labels may interpolate `{me.name}` and `{Name.count}`. A
  `{Name.count}` token must name declared data.

No other kinds, roles, actions, or runtime control flow are added by v0.2.
