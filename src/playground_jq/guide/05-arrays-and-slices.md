---
title: Arrays and slices
summary: Indexing arrays from either end, slicing arrays and strings, and iterating over arrays and objects with .[].
level: 101
---

The previous chapter took fields out of objects. This one does the same for arrays: single
elements by position, ranges of elements by slice, and all elements at once with the
iterator `.[]`, which also works on objects.

## Indexing: .[n]

`.[n]` produces the element at position `n`. Positions start at 0:

```jq-try
program: '.[0], .[2]'
input: '["a", "b", "c", "d", "e"]'
caption: The first and the third element.
expected: ["a", "c"]
```

A negative index counts from the end: `.[-1]` is the last element, `.[-2]` the one before:

```jq-try
program: '.[-1], .[-2]'
input: '["a", "b", "c", "d", "e"]'
caption: Counting from the end.
expected: ["e", "d"]
```

An index outside the array is not an error. Like a missing key, it gives `null`:

```jq-try
program: '.[10], .[-10]'
input: '["a", "b", "c", "d", "e"]'
caption: Out of range in either direction gives null.
expected: [null, null]
```

Indexes and field names combine freely into paths:

```jq-try
program: '.store.books[0].title, .store.books[-1].title'
ref: static:bookstore
caption: The first and the last book in the bookstore.
expected: ["Learning jq", "Streams and Generators"]
```

A number index only works on arrays (and `null`). Using one on an object, or a string key on
an array, is an error:

```jq-try
program: '.store[0]'
ref: static:bookstore
error: 'Cannot index object with number'
caption: 'A common mistake: .store is an object, not an array.'
```

See [array index](https://jqlang.org/manual/v1.8/#array-index).

## Slices: .[from:to]

`.[from:to]` produces a new array with the elements from position `from` up to, but not
including, position `to`. Either end may be left out, and either may be negative:

| Slice | Meaning |
| --- | --- |
| `.[2:4]` | Elements 2 and 3. |
| `.[:2]` | The first two elements. |
| `.[2:]` | Everything from element 2 on. |
| `.[-2:]` | The last two elements. |
| `.[:-1]` | Everything except the last element. |

```jq-try
program: '.[2:4], .[:2], .[-2:]'
input: '["a", "b", "c", "d", "e"]'
caption: A slice is always an array, even with one element.
expected: [["c", "d"], ["a", "b"], ["d", "e"]]
```

Slices never fail on out-of-range positions; they are clamped to the array, and a range
that is empty gives `[]`:

```jq-try
program: '.[1:100], .[3:1]'
input: '["a", "b", "c", "d", "e"]'
caption: The end is clamped; a backwards range is empty.
expected: [["b", "c", "d", "e"], []]
```

```jq-try
program: '.store.books[:3] | map(.title)'
ref: static:bookstore
caption: The titles of the first three books.
expected: [["Learning jq", "JSON at Scale", "Pipes and Paths"]]
```

## Slicing strings

Slices also work on strings, by Unicode code point rather than by byte. The result is a
string:

```jq-try
program: '.[0:2], .[3:], .[-5:]'
input: '"jq rocks"'
caption: Substrings by position.
expected: ["jq", "rocks", "rocks"]
```

```jq-try
program: '.[1:3]'
input: '"héllo"'
caption: é counts as one character.
expected: ["él"]
```

Strings cannot be indexed by a single number in jq, though. To get one character, use a
slice of length one:

```jq-try
program: '.[0]'
input: '"jq rocks"'
error: 'Cannot index string with number'
caption: 'A common mistake: .[0] does not work on a string.'
```

```jq-try
program: '.[0:1]'
input: '"jq rocks"'
caption: The first character, as a one-character string.
expected: ["j"]
```

See [array/string slice](https://jqlang.org/manual/v1.8/#array-string-slice).

## Iterating: .[]

`.[]` produces every element of an array as a separate output. It is the filter that turns
one value into a stream, and it is how jq programs visit every item of a list:

```jq-try
program: '.[]'
input: '["a", "b", "c"]'
caption: One array in, three strings out.
expected: ["a", "b", "c"]
```

Whatever follows `.[]` in a path runs once for each element:

```jq-try
program: '.store.books[].title'
ref: static:bookstore
caption: The title of every book, one output each.
expected: ["Learning jq", "JSON at Scale", "Pipes and Paths", "The Art of the Shell", "Functional Filters", "Data Wrangling Recipes", "Regular Expressions Unleashed", "Streams and Generators"]
```

Iterators nest. `.[][]` iterates the elements of each element:

```jq-try
program: '.[][]'
input: '[[1, 2], [3], []]'
caption: The inner arrays are flattened into one stream. The empty array contributes nothing.
expected: [1, 2, 3]
```

The outputs of `.[]` are a stream, not an array. To get an array back, wrap the expression
in `[...]`, as the chapter *Building values* shows.

## Iterating objects

On an object, `.[]` produces the values, in the object's key order. The keys themselves are
lost; use `keys`, `to_entries` or `with_entries` when you need them (covered later in the
guide).

```jq-try
program: '.[]'
input: '{"a": 1, "b": 2, "c": 3}'
caption: The values of an object.
expected: [1, 2, 3]
```

```jq-try
program: '.store.location[]'
ref: static:bookstore
caption: The values of the store's location object.
expected: ["Oslo", "NO"]
```

## Optional iteration: .[]?

`.[]` fails on anything that is not an array or an object, including `null`. That is the
most frequent error when data has an optional list:

```jq-try
program: '.[] | .roles[]'
input: '[{"name": "a", "roles": ["admin"]}, {"name": "b"}]'
error: 'Cannot iterate over null'
caption: The second object has no roles, so .roles is null.
```

`.[]?` suppresses that error: on a value that cannot be iterated, it produces nothing.

```jq-try
program: '.[] | .roles[]?'
input: '[{"name": "a", "roles": ["admin"]}, {"name": "b"}]'
caption: The object without roles simply contributes no outputs.
expected: ["admin"]
```

```jq-try
program: '.[] | .[]?'
input: '[[1, 2], "text", {"k": 3}, null, 4]'
caption: Only the array and the object can be iterated.
expected: [1, 2, 3]
```

See [array/object value iterator](https://jqlang.org/manual/v1.8/#array-object-value-iterator).

## Summary

| Form | On arrays | On strings | On objects | On null |
| --- | --- | --- | --- | --- |
| `.[n]` | element or null | error | error | null |
| `.[a:b]` | sub-array | substring | error | null |
| `.[]` | each element | error | each value | error |
| `.[]?` | each element | nothing | each value | nothing |
