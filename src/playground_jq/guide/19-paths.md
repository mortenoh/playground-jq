---
title: Paths
summary: Paths as data - path, paths, getpath, setpath, delpaths, del, the entries functions and pick - and how to walk a nested configuration.
level: 201
---

Every value inside a JSON document has an address: the sequence of keys and indices you follow
from the top to reach it. jq calls this a path and represents it as an array, such as
`["store", "books", 0, "title"]`. Most of the time you write paths as filters (`.store.books[0].title`),
but turning them into data lets you list every location in a document, compute locations, and
read, set or delete values at locations you did not know in advance.

## path(f): a filter as a path

[`path(f)`](https://jqlang.org/manual/v1.8/#path) runs `f` and, instead of the values it would
produce, outputs the path of each one. The filter must be a path expression: a chain of field
accesses, indexing, `.[]`, `..`, `select`, `if`, `first` and similar. Filters that compute new
values, such as `map` or arithmetic, have no path.

```jq-try
program: 'path(.store.books[0].title)'
ref: static:bookstore
caption: The path of one field, as an array of keys and indices.
expected: [["store", "books", 0, "title"]]
```

```jq-try
program: '[path(.store.books[] | select(.price > 25))]'
ref: static:bookstore
caption: 'The paths of the books over 25: select keeps the path of what it lets through.'
expected: [[["store", "books", 3], ["store", "books", 7]]]
```

```jq-try
program: 'path(.a | map(.b))'
input: '{"a": []}'
caption: 'Common mistake: map builds a new array, which has no location in the input.'
error: 'Invalid path expression'
```

## paths and paths(f)

[`paths`](https://jqlang.org/manual/v1.8/#paths) outputs the path of every value in the input
except the input itself: the same as `path(..)` without the empty path at the start.
`paths(f)` keeps only the paths whose value makes `f` truthy.

```jq-try
program: '[paths]'
input: '{"a": [1, {"b": 2}]}'
caption: Every location, parents before children.
expected: [[["a"], ["a", 0], ["a", 1], ["a", 1, "b"]]]
```

```jq-try
program: '[paths(type == "number")]'
input: '{"a": [1, {"b": 2}], "c": "x"}'
caption: Only the locations that hold numbers.
expected: [[["a", 0], ["a", 1, "b"]]]
```

## The paths(scalars) pitfall

The obvious way to list the leaves of a document, the values that are not objects or arrays, is
`paths(scalars)`. It is wrong for `false` and `null`. `paths(f)` keeps a path when `f` outputs a
truthy value, and `scalars` outputs the value itself. For a leaf holding `false` or `null`, the
output is falsy, so the path is dropped.

```jq-try
program: '[paths(scalars)]'
input: '{"a": 1, "b": false, "c": null, "d": "x"}'
caption: 'Common mistake: the leaves "b" and "c" are missing.'
expected: [[["a"], ["d"]]]
```

The fix is a condition that is always `true` or `false`, never the value itself:

```jq-try
program: '[paths(type | IN("object", "array") | not)]'
input: '{"a": 1, "b": false, "c": null, "d": "x"}'
caption: All four leaves, including false and null.
expected: [[["a"], ["b"], ["c"], ["d"]]]
```

On a real configuration the difference is three settings that silently disappear, all of them
switched off:

```jq-try
program: '[paths(type | IN("object", "array") | not)] - [paths(scalars)] | map(join("."))'
ref: static:config
caption: The leaves that paths(scalars) misses in the config file.
expected: [["app.debug", "features.radar", "features.beta.ai_summaries"]]
```

Older jq versions had `leaf_paths`, defined as `paths(scalars)` and with the same flaw. It is not
defined in jq 1.8.

```jq-try
program: '[leaf_paths]'
input: '{"a": 1}'
caption: 'leaf_paths is gone in jq 1.8; use the paths(...) condition above.'
error: 'leaf_paths/0 is not defined'
```

## getpath, setpath and delpaths

These three take paths as data. [`getpath(p)`](https://jqlang.org/manual/v1.8/#getpath) reads the
value at `p`, giving `null` when a key along the way is missing.
[`setpath(p; v)`](https://jqlang.org/manual/v1.8/#setpath) returns a copy with `v` at `p`,
creating objects and arrays as needed. [`delpaths(ps)`](https://jqlang.org/manual/v1.8/#delpaths)
removes a list of paths at once.

```jq-try
program: 'getpath(["database", "pool", "max"]), getpath(["database", "replica", "host"])'
ref: static:config
caption: An existing path, and a missing one (null, not an error).
expected: [20, null]
```

```jq-try
program: 'getpath(["a", "b"])'
input: '{"a": [1, 2]}'
caption: 'Common mistake: a missing key is fine, but a key into an array is a type error.'
error: 'Cannot index array with string'
```

```jq-try
program: 'setpath(["server", "tls", "enabled"]; false) | .server.tls, (null | setpath(["x", 2]; 1))'
ref: static:config
caption: Changing one value, then building a structure from nothing; the array is padded with null.
expected: [{"enabled": false, "cert": "/etc/ssl/app.pem", "key": "/etc/ssl/app.key"}, {"x": [null, null, 1]}]
```

```jq-try
program: 'delpaths([paths(type == "boolean")]) | .features'
ref: static:config
caption: Every boolean setting removed; only the empty "beta" object is left in features.
expected: [{"beta": {}}]
```

## del

[`del(f)`](https://jqlang.org/manual/v1.8/#del) is `delpaths([path(f)])`: it deletes whatever the
path expression `f` points at. Several paths can be given with commas, and `select` inside `f`
deletes conditionally.

```jq-try
program: 'del(.database.password, .server.tls.key) | .database.password, .server.tls'
ref: static:config
caption: Two secrets removed; reading the deleted key now gives null.
expected: [null, {"enabled": true, "cert": "/etc/ssl/app.pem"}]
```

```jq-try
program: 'del(.[] | select(. > 2))'
input: '[1, 5, 2, 7]'
caption: Deleting array elements by condition; the remaining ones close up.
expected: [[1, 2]]
```

```jq-try
program: 'del(.. | nulls)'
input: '{"a": null, "b": {"c": null, "d": 1}}'
caption: Removing every null at any depth.
expected: [{"b": {"d": 1}}]
```

## to_entries, from_entries and with_entries

[`to_entries`](https://jqlang.org/manual/v1.8/#to_entries-from_entries-with_entries) turns an
object into an array of `{key, value}` pairs. `from_entries` turns such an array back into an
object; it also accepts `name`, `Name` or `Key` instead of `key`, and `Value` instead of `value`. Keys
must end up as strings. `with_entries(f)` is `to_entries | map(f) | from_entries`, the standard
way to transform or filter an object's keys and values together.

```jq-try
program: 'to_entries, (to_entries | from_entries)'
input: '{"host": "db.internal", "port": 5432}'
caption: There and back again.
expected: [[{"key": "host", "value": "db.internal"}, {"key": "port", "value": 5432}], {"host": "db.internal", "port": 5432}]
```

```jq-try
program: '.database | with_entries(select(.key != "password")) | with_entries(.key |= ascii_upcase)'
ref: static:config
caption: Dropping one key, then renaming all of them.
expected: [{"DRIVER": "postgres", "HOST": "db.internal", "PORT": 5432, "NAME": "weather", "POOL": {"min": 2, "max": 20}}]
```

```jq-try
program: 'from_entries'
input: '[{"name": "a", "value": 1}, {"Key": "b", "Value": 2}]'
caption: Other spellings of key and value are accepted.
expected: [{"a": 1, "b": 2}]
```

```jq-try
program: 'from_entries'
input: '[{"key": 1, "value": "one"}]'
caption: 'Common mistake: a numeric key is not converted. Use (.key | tostring).'
error: 'Cannot use number (1) as object key'
```

## pick

[`pick(pathexps)`](https://jqlang.org/manual/v1.8/#pick), added in jq 1.7, keeps only the given
paths and rebuilds the structure around them. It is the path-based counterpart of `{a, b}`
object construction, and it works at any depth. When a path goes through an array index, the
earlier elements are filled with `null`.

```jq-try
program: 'pick(.app.name, .database.host, .server.port)'
ref: static:config
caption: A small view of the config, with the original nesting.
expected: [{"app": {"name": "weather-api"}, "database": {"host": "db.internal"}, "server": {"port": 8080}}]
```

```jq-try
program: 'pick(.cache.backends[1])'
ref: static:config
caption: Index 1 kept, index 0 padded with null.
expected: [{"cache": {"backends": [null, "redis"]}}]
```

## Walking a configuration

With paths as data, whole-document tasks become short. A flat listing of every setting, with
dotted keys, is a single pipeline:

```jq-try
program: '[paths(type | IN("object", "array") | not) as $p | {key: ($p | map(tostring) | join(".")), value: getpath($p)}] | from_entries | with_entries(select(.key | startswith("server.")))'
ref: static:config
caption: 'Flattened to "dotted.key": value, showing only the server settings.'
expected: [{"server.host": "0.0.0.0", "server.port": 8080, "server.tls.enabled": true, "server.tls.cert": "/etc/ssl/app.pem", "server.tls.key": "/etc/ssl/app.key", "server.timeouts.read": 30, "server.timeouts.write": 30, "server.timeouts.idle": 120}]
```

Finding settings by the name of their key, anywhere in the tree:

```jq-try
program: '[paths(strings) as $p | select($p[-1] | tostring | test("password|key")) | $p | join(".")]'
ref: static:config
caption: The paths of string settings whose key looks secret.
expected: [["server.tls.key", "database.password"]]
```

Redacting them keeps the structure intact and replaces only the values:

```jq-try
program: 'reduce (paths(strings) | select(.[-1] | tostring | test("password|key"))) as $p (.; setpath($p; "***")) | {database: .database.password, tls: .server.tls}'
ref: static:config
caption: The secrets replaced in place; everything else unchanged.
expected: [{"database": "***", "tls": {"enabled": true, "cert": "/etc/ssl/app.pem", "key": "***"}}]
```

Applying an environment override means copying every leaf of the override onto the base
configuration. Walking the leaves of `environments.prod` and setting each one leaves all other
settings alone, which is exactly what a deep merge should do.

```jq-try
program: '.environments.prod as $o | reduce ($o | paths(type | IN("object", "array") | not)) as $p (del(.environments); setpath($p; $o | getpath($p))) | {port: .server.port, db: .database.host, pool: .database.pool}'
ref: static:config
caption: 'Production values applied: port 443, the prod host, pool max 100, and pool min still 2.'
expected: [{"port": 443, "db": "db.prod.internal", "pool": {"min": 2, "max": 100}}]
```

For objects, the `*` operator performs the same deep merge in one step; the path version also
works when you need to decide per leaf what happens.

```jq-try
program: '(del(.environments) * .environments.prod) | {port: .server.port, db: .database.host, pool: .database.pool}'
ref: static:config
caption: The same result with the recursive merge operator.
expected: [{"port": 443, "db": "db.prod.internal", "pool": {"min": 2, "max": 100}}]
```
