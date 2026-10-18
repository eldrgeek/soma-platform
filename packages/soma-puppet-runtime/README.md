# `@soma/puppet-runtime`

The dependency-free, non-browser core for applications described in Puppet
Script. It parses and validates Puppet Script v0.1/v0.2, and provides a store
contract plus an in-memory implementation for versioned descriptions and
declared application data.

This package implements the ruling in
`SOMA/specs/puppet-spec-of-record-v0.md` §1a: apps made in SOMA Forge run from
their Puppet Script description at runtime. An app changes when its host
approves a new, undoable description version; changing it does not require a
deploy.

## Store adapter

`StoreAdapter` defines asynchronous methods that persistent adapters implement:

- `getCurrent(appId)`
- `listVersions(appId)`
- `propose(appId, { source, author, reason })`
- `approve(appId, versionId, approver)`
- `undo(appId, approver)`
- `list(appId, data)`
- `add(appId, data, row, author)`
- `remove(appId, data, rowId, actor)`

`MemoryStore` and `createMemoryStore()` implement that contract in process.
Pass app configuration keyed by app id, for example:

```js
const store = createMemoryStore({
  'sunday-supper': { hostId: 'rosa' },
});
```

Proposals are parsed before storage and remain non-live until the configured
host approves them. Only that host can approve or undo. Writes accept only
fields declared by the current version's `data` block, and rows can be removed
only by their author or the host.

Run the tests with:

```sh
npm test
```

## Slice 2

The next slice adds the browser renderer; Netlify Functions backed by a Netlify
Blobs adapter with a Supabase JWT check; the feedback chip; and a runnable
Sunday Supper example.
