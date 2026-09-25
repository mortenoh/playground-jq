---
title: Building values
summary: Constructing objects (shorthand, computed keys, variables) and arrays, and how generators inside a constructor multiply the results.
level: 101
---

So far every filter has taken values apart. Reshaping data also needs the opposite: new
objects with the fields you want, under the names you want, and arrays that collect results.
jq has two constructors for this, `{...}` and `[...]`, and both are ordinary filters that
run against the current input.

## Object construction

An object constructor lists `key: value` pairs. Each value is a filter, run against the
constructor's input:

```jq-try
program: '{title: .title, year: .year}'
input: '{"title": "Learning jq", "author": "Ada Filter", "year": 2021, "price": 8.5}'
caption: A new object with two fields taken from the input.
expected: [{"title": "Learning jq", "year": 2021}]
```

Keys can be renamed freely, and values can be any expression, including literals and nested
constructors:

```jq-try
program: '{name: .title, published: .year, meta: {source: "bookstore", cheap: (.price < 10)}}'
input: '{"title": "Learning jq", "author": "Ada Filter", "year": 2021, "price": 8.5}'
caption: Renamed keys, a literal, and a nested object.
expected: [{"name": "Learning jq", "published": 2021, "meta": {"source": "bookstore", "cheap": true}}]
```

A value that contains a comma at the top level must be put in parentheses, because the
comma would otherwise separate the pairs: `{a: .x, .y}` is a syntax error, `{a: (.x, .y)}`
is not. jq 1.8 does accept a pipe in a value (`{a: .x | length}`), but parentheses make
any value that is more than a path easier to read. See
[object construction](https://jqlang.org/manual/v1.8/#object-construction).

## Shorthand: {title, price}

When the new key is the same as the field it comes from, write the name once. `{title}` means
`{title: .title}`:

```jq-try
program: '.store.books[] | {title, price}'
ref: static:bookstore
caption: Picking two fields from every book. This is the most common object constructor.
expected: [{"title": "Learning jq", "price": 8.5}, {"title": "JSON at Scale", "price": 24}, {"title": "Pipes and Paths", "price": 6.25}, {"title": "The Art of the Shell", "price": 31.9}, {"title": "Functional Filters", "price": 19.99}, {"title": "Data Wrangling Recipes", "price": 14.5}, {"title": "Regular Expressions Unleashed", "price": 22}, {"title": "Streams and Generators", "price": 27.75}]
```

Keys that are not identifiers are quoted, in the shorthand as well as the full form:

```jq-try
program: '{"first name": .first, "a b"}'
input: '{"first": "Ada", "a b": 1}'
caption: A quoted key with a value, and a quoted shorthand key.
expected: [{"first name": "Ada", "a b": 1}]
```

Keywords such as `if` and `and` can be used as keys directly.

## Computed keys: {(.k): .v}

A key in parentheses is an expression. Its result, which must be a string, becomes the key:

```jq-try
program: '{(.name): .value}'
input: '{"name": "color", "value": "blue"}'
caption: The key is taken from the data.
expected: [{"color": "blue"}]
```

A string with interpolation also works as a key:

```jq-try
program: '{"\(.name)_upper": (.value | ascii_upcase)}'
input: '{"name": "color", "value": "blue"}'
caption: An interpolated string as the key.
expected: [{"color_upper": "BLUE"}]
```

Computed keys make it possible to turn a list of records into a lookup object. `add` (see
*Operators*) merges the small objects together:

```jq-try
program: '[.store.staff[] | {(.name): .role}] | add'
ref: static:bookstore
caption: A lookup from staff name to role.
expected: [{"Ingrid": "owner", "Omar": "clerk", "Lena": "clerk"}]
```

A computed key that is not a string is an error. A missing field gives `null`, which is the
usual cause:

```jq-try
program: '{(.key): .value}'
input: '{"name": "color", "value": "blue"}'
error: 'Cannot use null (null) as object key'
caption: 'A common mistake: the field is called name, so .key is null.'
```

## Keys from variables: {$x}

Variables are covered in their own chapter later; for now it is enough that `... as $x`
binds a value to the name `$x`, and that `--arg` and `--argjson` create variables too.
`{$x}` is shorthand for `{x: $x}`: the variable's name becomes the key.

```jq-try
program: '.title as $title | .year as $year | {$title, $year}'
input: '{"title": "Learning jq", "year": 2021}'
caption: Variable names as keys, variable values as values.
expected: [{"title": "Learning jq", "year": 2021}]
```

```jq-try
program: '{$user, count: (.items | length)}'
input: '{"items": [1, 2, 3]}'
options: {args: {user: ada}}
caption: A variable from --arg user ada, shorthand and ordinary fields together.
expected: [{"user": "ada", "count": 3}]
```

To use the *value* of a variable as the key, put it in parentheses, `{($k): ...}`; jq 1.8
also accepts `{$k: ...}` for the same thing:

```jq-try
program: '"color" as $k | {($k): "blue"}, {$k: "blue"}'
input: 'null'
caption: Both forms use the string "color" as the key.
expected: [{"color": "blue"}, {"color": "blue"}]
```

## Array construction: [...]

`[ f ]` runs the filter `f` and collects all of its outputs, in order, into one array. It is
the bridge from a stream back to a single value:

```jq-try
program: '[.store.books[] | .title]'
ref: static:bookstore
caption: Eight separate titles collected into one array.
expected: [["Learning jq", "JSON at Scale", "Pipes and Paths", "The Art of the Shell", "Functional Filters", "Data Wrangling Recipes", "Regular Expressions Unleashed", "Streams and Generators"]]
```

The filter inside can be anything, including a comma-separated list or a pipeline with
generators. If it produces nothing, the result is the empty array:

```jq-try
program: '[.a, .b], [.c[]], [.missing[]?]'
input: '{"a": 1, "b": 2, "c": [3, 4]}'
caption: A comma list, an iteration, and an iteration that produced nothing.
expected: [[1, 2], [3, 4], []]
```

Because the array collects a stream, you can operate on the whole result afterwards, which
is how counting and sorting are done:

```jq-try
program: '[.store.books[] | select(.inStock > 0) | .title] | length'
ref: static:bookstore
caption: Six of the eight books are in stock.
expected: [6]
```

See [array construction](https://jqlang.org/manual/v1.8/#array-construction).
`[.[] | f]` is so common that it has a name, `map(f)`, covered in *Select, map and empty*.

## Generators in object construction

When a value in an object constructor produces several outputs, the constructor produces
one object per output. With several such values, it produces one object for every
combination: a cartesian product.

```jq-try
program: '{name, tag: .tags[]}'
input: '{"name": "Learning jq", "tags": ["jq", "cli", "beginner"]}'
caption: One object per tag.
expected: [{"name": "Learning jq", "tag": "jq"}, {"name": "Learning jq", "tag": "cli"}, {"name": "Learning jq", "tag": "beginner"}]
```

```jq-try
program: '{size: ("S", "M"), color: ("red", "blue", "green")}'
input: 'null'
caption: Two sizes times three colors gives six objects.
expected: [{"size": "S", "color": "red"}, {"size": "S", "color": "blue"}, {"size": "S", "color": "green"}, {"size": "M", "color": "red"}, {"size": "M", "color": "blue"}, {"size": "M", "color": "green"}]
```

This is useful for unnesting (one row per tag, per item, per role), but it is also a source
of surprising output: if a field you expected to hold one value is an iterator, the number of
objects multiplies. When you want the values kept together, collect them with `[...]`:

```jq-try
program: '{name, tags: [.tags[] | ascii_upcase]}'
input: '{"name": "Learning jq", "tags": ["jq", "cli", "beginner"]}'
caption: The brackets keep all tags in one object.
expected: [{"name": "Learning jq", "tags": ["JQ", "CLI", "BEGINNER"]}]
```

```jq-try
program: '.[] | {username, role: .roles[]}'
ref: static:users
caption: One row per user and role. ken has no roles, so he produces no rows at all.
expected: [{"username": "ada", "role": "admin"}, {"username": "ada", "role": "editor"}, {"username": "grace", "role": "editor"}, {"username": "linus", "role": "viewer"}, {"username": "margaret", "role": "admin"}, {"username": "barbara", "role": "editor"}, {"username": "barbara", "role": "viewer"}]
```

## Keys with the same name

If a key appears twice in a constructor, the last one wins. Keys keep the order in which they
are first written:

```jq-try
program: '{a: 1, b: 2, a: 3}'
input: 'null'
caption: The second a replaces the first, and keeps its position.
expected: [{"a": 3, "b": 2}]
```
