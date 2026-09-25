---
title: Working with collections
summary: The everyday builtins for arrays and objects - measuring, testing, combining, slicing and searching.
level: 201
---

Most jq programs spend their time on arrays and objects: counting them, adding them up,
asking whether something is in them, or picking a few items out. jq ships a large set of
builtins for this. This chapter walks through the ones you will reach for every day, grouped
by the question they answer.

A pattern repeats throughout: many builtins come in two flavours. One works on the array
that is the input (`add`, `any`, `first`), the other takes a generator as an argument and
works on its outputs without building an array first (`add(f)`, `any(gen; cond)`,
`first(f)`). The generator form is often shorter and cheaper.

## Measuring: length and utf8bytelength

[`length`](https://jqlang.org/manual/v1.8/#length) means something different for each type:
the number of elements of an array, the number of keys of an object, the number of Unicode
code points of a string, the absolute value of a number, and zero for `null`. Booleans
have no length and raise an error.

```jq-try
program: '.[] | length'
input: '[[1, 2, 3], {"a": 1, "b": 2}, "héllo", -7, null]'
caption: One length per value; note that "héllo" counts five characters and -7 has length 7.
expected: [3, 2, 5, 7, 0]
```

[`utf8bytelength`](https://jqlang.org/manual/v1.8/#utf8bytelength) counts bytes instead of
characters, which matters when a database column or an HTTP header has a byte limit.

```jq-try
program: '{chars: length, bytes: utf8bytelength}'
input: '"héllo"'
caption: The "é" is one character but two bytes in UTF-8.
expected: [{"chars": 5, "bytes": 6}]
```

```jq-try
program: '.[] | length'
input: '[true]'
caption: 'Common mistake: booleans have no length.'
error: 'boolean (true) has no length'
```

## Keys and membership: keys, has, in

[`keys`](https://jqlang.org/manual/v1.8/#keys-keys_unsorted) returns the keys of an object
sorted by code point; `keys_unsorted` keeps them in insertion order. On an array, `keys`
returns the indices.

```jq-try
program: 'keys, keys_unsorted'
input: '{"title": "Learning jq", "author": "Ada Filter", "year": 2021}'
caption: 'The same keys, sorted and in document order.'
expected: [["author", "title", "year"], ["title", "author", "year"]]
```

[`has(key)`](https://jqlang.org/manual/v1.8/#has) asks whether the input has a key (for an
object) or an index (for an array). It checks for presence, not for a non-null value: a key
that holds `null` still counts. [`in(object)`](https://jqlang.org/manual/v1.8/#in) is the same
test turned around: the key is the input and the collection is the argument, which reads well
inside `select` or `map`.

```jq-try
program: 'has("email"), has("phone"), (.tags | has(1), has(5))'
input: '{"email": null, "tags": ["a", "b"]}'
caption: A key holding null is present; index 5 of a two-element array is not.
expected: [true, false, true, false]
```

```jq-try
program: '.[] | select(in({"bug": 1, "docs": 1}))'
input: '["bug", "feature", "docs", "question"]'
caption: in() keeps the strings that are keys of the lookup object.
expected: ["bug", "docs"]
```

## Combining: add and add(f)

[`add`](https://jqlang.org/manual/v1.8/#add) combines the elements of an array with `+`. What
`+` means depends on the type: numbers are summed, strings concatenated, arrays joined, and
objects merged (later keys win). `null` elements are ignored, and an empty array adds up to
`null`.

```jq-try
program: '(.numbers | add), (.words | add), (.lists | add), (.objects | add), ([] | add)'
input: '{"numbers": [1, 2, null, 3], "words": ["jq", "is", "fun"], "lists": [[1], [2, 3]], "objects": [{"a": 1}, {"a": 2, "b": 3}]}'
caption: 'Each type adds in its own way. The empty array gives null.'
expected: [6, "jqisfun", [1, 2, 3], {"a": 2, "b": 3}, null]
```

jq 1.8 adds `add(f)`, which adds the outputs of the generator `f` directly. `add(.[].price)`
does the same as `map(.price) | add` without building the intermediate array.

```jq-try
program: '.store.books | add(.[].price), (map(.inStock) | add)'
ref: static:bookstore
caption: The total list price of all books, then the number of copies in stock.
expected: [154.89, 37]
```

Mixing types that `+` cannot combine is an error, so clean up the data first (`numbers`,
`strings`, or `tonumber`).

```jq-try
program: 'add'
input: '[1, "2", 3]'
caption: 'Common mistake: a number and a string cannot be added.'
error: 'cannot be added'
```

## Testing: any and all

[`any`](https://jqlang.org/manual/v1.8/#any) and [`all`](https://jqlang.org/manual/v1.8/#all)
answer yes/no questions about a collection. Without arguments they test whether the elements
are truthy. With one argument, `any(cond)` applies the condition to each element of the input
array. With two, `any(generator; cond)` tests the outputs of a generator and stops as soon as
the answer is known. On an empty array `any` is `false` and `all` is `true`.

```jq-try
program: '(.flags | any, all), (.nums | any(. > 2), all(. > 0)), ([] | any, all)'
input: '{"flags": [true, false, true], "nums": [1, 2, 3]}'
caption: 'Truthiness, a condition per element, and the empty cases.'
expected: [true, false, true, true, false, true]
```

```jq-try
program: '.store.books | any(.[]; .inStock == 0), all(.[]; .price < 40)'
ref: static:bookstore
caption: 'Is any book sold out? Is every book under 40? The generator form.'
expected: [true, true]
```

## Flattening and generating: flatten and range

[`flatten`](https://jqlang.org/manual/v1.8/#flatten) removes nesting from an array of arrays.
Without an argument it flattens all the way down; `flatten(depth)` stops after that many
levels.

```jq-try
program: 'flatten, flatten(1)'
input: '[1, [2, [3, [4]]]]'
caption: Fully flattened, then flattened one level only.
expected: [[1, 2, 3, 4], [1, 2, [3, [4]]]]
```

[`range`](https://jqlang.org/manual/v1.8/#range) is a generator of numbers. `range(n)` counts
from 0 up to but not including `n`; `range(from; upto)` sets the start; `range(from; upto; by)`
sets the step, which may be negative. Wrap it in `[...]` to collect the numbers.

```jq-try
program: '[range(5)], [range(2; 5)], [range(0; 10; 3)], [range(5; 0; -2)]'
options: {null_input: true}
caption: One, two and three arguments. The upper bound is never included.
expected: [[0, 1, 2, 3, 4], [2, 3, 4], [0, 3, 6, 9], [5, 3, 1]]
```

## Arithmetic helpers

jq has the usual [math functions](https://jqlang.org/manual/v1.8/#math): `floor`, `ceil`,
`round`, `sqrt`, `fabs`, `log` (natural), `log10`, `log2`, `exp`, and the two-argument
`pow(base; exponent)`. The one-argument functions work on their input, so they sit on the right
of a pipe (`16 | sqrt`); `pow` ignores its input and takes both numbers as arguments.

```jq-try
program: '{floor: map(floor), ceil: map(ceil), round: map(round)}'
input: '[-1.5, 2.7, 3.2]'
caption: floor rounds down, ceil rounds up, round goes to the nearest integer (halves away from zero).
expected: [{"floor": [-2, 2, 3], "ceil": [-1, 3, 4], "round": [-2, 3, 3]}]
```

```jq-try
program: '(16 | sqrt), pow(2; 10), (1000 | log10), (8 | log2)'
options: {null_input: true}
caption: Square root, a power, and logarithms in base 10 and 2.
expected: [4, 1024, 3, 3]
```

## Extremes and order: min, max, min_by, max_by, reverse

[`min` and `max`](https://jqlang.org/manual/v1.8/#min-max-min_by-max_by) return the smallest
and largest element, using jq's ordering of values (chapter 12 explains how mixed types
compare). `min_by(f)` and `max_by(f)` compare by a key and return the whole element, which is
usually what you want with objects. On an empty array all four return `null`.

```jq-try
program: '.store.books | (map(.price) | min, max), (max_by(.year) | .title), (min_by(.inStock) | .title)'
ref: static:bookstore
caption: The cheapest and dearest price, the newest book, and the first book with the lowest stock.
expected: [6.25, 31.9, "Functional Filters", "JSON at Scale"]
```

When several elements share the smallest key, `min_by` returns the first of them; "JSON at
Scale" and "Data Wrangling Recipes" both have zero copies, and the earlier one wins.

[`reverse`](https://jqlang.org/manual/v1.8/#reverse) reverses an array. It does not reverse
strings in jq 1.8; go through code points instead.

```jq-try
program: '(.list | reverse), (.word | explode | reverse | implode)'
input: '{"list": [1, 2, 3], "word": "stressed"}'
caption: Reversing an array, and reversing a string by way of its code points.
expected: [[3, 2, 1], "desserts"]
```

```jq-try
program: 'reverse'
input: '"abc"'
caption: 'Common mistake: reverse on a string is an error in jq 1.8.'
error: 'Cannot index string'
```

## Containment: contains and inside

[`contains(b)`](https://jqlang.org/manual/v1.8/#contains) is a deep, partial match. For strings
it is a substring test. For arrays, every element of `b` must be contained in some element of
the input. For objects, every key of `b` must be present and its value contained. Because of
this, `["foobar"] | contains(["bar"])` is true: the string test applies inside the array.
[`inside`](https://jqlang.org/manual/v1.8/#inside) is the same relation with the arguments
swapped.

```jq-try
program: '("foobar" | contains("bar")), ({"a": [1, 2, 3], "b": "x"} | contains({a: [1]})), (["foobar"] | contains(["bar"])), ("bar" | inside("foobar"))'
options: {null_input: true}
caption: Substrings, partial objects, and the surprising substring match inside arrays.
expected: [true, true, true, true]
```

```jq-try
program: '[.store.books[] | select(.tags | contains(["jq", "advanced"])) | .title]'
ref: static:bookstore
caption: Books tagged with both "jq" and "advanced".
expected: [["Functional Filters", "Streams and Generators"]]
```

## Searching: indices, index, rindex

[`indices(s)`](https://jqlang.org/manual/v1.8/#indices) returns every position where `s`
occurs: substrings in a string, elements in an array, or a sub-array in an array.
[`index` and `rindex`](https://jqlang.org/manual/v1.8/#index-rindex) return the first and the
last position, or `null` when there is none.

```jq-try
program: 'indices(", "), index(", "), rindex(", "), index("zzz")'
input: '"a, b, cd, efg"'
caption: All positions of a substring, the first, the last, and a miss (null).
expected: [[1, 4, 8], 1, 8, null]
```

```jq-try
program: 'indices(1), indices([1, 2])'
input: '[1, 2, 1, 3, 1, 2]'
caption: An element, and a sub-array (its starting positions).
expected: [[0, 2, 4], [0, 4]]
```

## Taking a few: first, last, nth, limit, skip

[`first`, `last` and `nth(n)`](https://jqlang.org/manual/v1.8/#first-last-nth-2) index into the
input array. Their generator forms, `first(f)`, `last(f)` and `nth(n; f)`, take outputs of a
generator; `first(f)` stops `f` after one output, so it is safe on long or infinite generators.
[`limit(n; f)`](https://jqlang.org/manual/v1.8/#limit) takes the first `n` outputs, and jq 1.8
adds [`skip(n; f)`](https://jqlang.org/manual/v1.8/#skip), which drops the first `n`.

```jq-try
program: 'first, last, nth(1), ([] | first)'
input: '[5, 6, 7]'
caption: The array forms. An empty array has no first element, so the answer is null.
expected: [5, 7, 6, null]
```

```jq-try
program: 'first(range(10; 20)), nth(2; range(10; 20)), [limit(3; range(100))], [skip(7; range(10))]'
options: {null_input: true}
caption: The generator forms stop early; limit keeps three outputs, skip drops seven.
expected: [10, 12, [0, 1, 2], [7, 8, 9]]
```

```jq-try
program: '[.store.books | sort_by(-.price) | limit(3; .[]) | .title]'
ref: static:bookstore
caption: The titles of the three most expensive books.
expected: [["The Art of the Shell", "Streams and Generators", "JSON at Scale"]]
```

## Wrapping in an array: toarray

Newer jq documentation mentions `toarray`, which wraps a value in an array unless it already
is one. jq 1.8.2, the version that runs here, does not define it, so a program that uses it
fails to compile. The definition is short enough to write inline.

```jq-try
program: '.[] | toarray'
input: '[1, [2]]'
caption: 'toarray is not available in jq 1.8.2.'
error: 'toarray/0 is not defined'
```

```jq-try
program: '[.[] | if type == "array" then . else [.] end]'
input: '[1, [2], "three"]'
caption: 'The portable way: wrap scalars, leave arrays as they are.'
expected: [[[1], [2], ["three"]]]
```

## Selecting parts of a structure: pick and getpath

[`pick(pathexps)`](https://jqlang.org/manual/v1.8/#pick), added in jq 1.7, builds an object (or
array) that keeps only the given paths, at their original nesting. It is like `{title, price}`
for deep paths. [`getpath(path)`](https://jqlang.org/manual/v1.8/#getpath) reads a value by a
path given as an array of keys and indices; a missing path gives `null` instead of an error.
Chapter 19 covers paths in depth.

```jq-try
program: 'pick(.store.name, .store.location.city)'
ref: static:bookstore
caption: Only the two paths survive, still nested under "store".
expected: [{"store": {"name": "The jq Bookshop", "location": {"city": "Oslo"}}}]
```

```jq-try
program: 'getpath(["store", "books", 0, "title"]), getpath(["store", "missing", "deep"])'
ref: static:bookstore
caption: A path as data. Missing paths give null.
expected: ["Learning jq", null]
```

## Rows and columns: transpose and combinations

[`transpose`](https://jqlang.org/manual/v1.8/#transpose) turns an array of rows into an array
of columns. Short rows are padded with `null`. It is the standard way to zip two arrays
together.

```jq-try
program: '[.names, .ages] | transpose | map({name: .[0], age: .[1]})'
input: '{"names": ["Astrid", "Bjorn", "Chiara"], "ages": [41, 29]}'
caption: Zipping two lists; the missing age becomes null.
expected: [[{"name": "Astrid", "age": 41}, {"name": "Bjorn", "age": 29}, {"name": "Chiara", "age": null}]]
```

[`combinations`](https://jqlang.org/manual/v1.8/#combinations) produces every way of picking
one element from each of the input arrays (the cartesian product). `combinations(n)` combines
the input array with itself `n` times.

```jq-try
program: '[combinations], ([0, 1] | [combinations(2)] | length)'
input: '[["S", "M"], ["red", "blue"]]'
caption: 'Two sizes times two colours give four variants; two bits give four pairs.'
expected: [[["S", "red"], ["S", "blue"], ["M", "red"], ["M", "blue"]], 4]
```
