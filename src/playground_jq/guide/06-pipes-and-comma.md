---
title: Pipes and the comma
summary: Combining filters with | and , , grouping with parentheses, how generators multiply outputs, and empty.
level: 101
---

Two operators do most of the work of putting jq programs together. The pipe `|` runs one
filter on the outputs of another. The comma `,` runs two filters on the same input and
concatenates their outputs. Together with parentheses and the understanding that every
filter produces a stream, they explain how any jq program runs.

## The pipe: |

`a | b` runs `a`, and then runs `b` once for every output of `a`, with that output as `b`'s
input. The outputs of all the runs of `b` are the outputs of the whole expression.

```jq-try
program: '.store | .location | .city'
ref: static:bookstore
caption: Each step's output is the next step's input.
expected: ["Oslo"]
```

When the left side produces several outputs, the right side runs several times:

```jq-try
program: '.store.staff[] | .name'
ref: static:bookstore
caption: .store.staff[] produces three objects, so .name runs three times.
expected: ["Ingrid", "Omar", "Lena"]
```

The important consequence is that `.` changes meaning across a pipe. On the right of `|`,
`.` is the current output of the left side, not the original input:

```jq-try
program: '.store.books[0] | .title, .year, (.tags | length)'
ref: static:bookstore
caption: After the pipe, . is the first book.
expected: ["Learning jq", 2021, 3]
```

See [pipe](https://jqlang.org/manual/v1.8/#pipe).

## The comma: ,

`a, b` runs `a` and `b` on the same input and produces the outputs of `a` followed by the
outputs of `b`:

```jq-try
program: '.name, .version, .name'
input: '{"name": "jq", "version": "1.8"}'
caption: Three filters, three outputs, in order. A field can appear more than once.
expected: ["jq", "1.8", "jq"]
```

The comma is how jq produces more than one result from one input. See
[comma](https://jqlang.org/manual/v1.8/#comma).

## Precedence and parentheses

The pipe binds more loosely than the comma, and more loosely than every other operator. So
`a, b | c` means `(a, b) | c`, and `a | b, c` means `a | (b, c)`:

```jq-try
program: '.[] | .name, .age'
input: '[{"name": "Ada", "age": 36}, {"name": "Alan", "age": 41}]'
caption: Read as .[] | (.name, .age), so the fields of each person come together.
expected: ["Ada", 36, "Alan", 41]
```

```jq-try
program: '.a, .b | length'
input: '{"a": "four", "b": [1, 2]}'
caption: Read as (.a, .b) | length, so length applies to both.
expected: [4, 2]
```

Parentheses group an expression exactly as in arithmetic. Here they keep `length` from
applying to `.a`:

```jq-try
program: '.a, (.b | length)'
input: '{"a": "four", "b": [1, 2]}'
caption: The parentheses limit the pipe to .b.
expected: ["four", 2]
```

Forgetting this is one of the most frequent mistakes in jq. Everything after a `|` applies
to everything before it, up to the nearest enclosing parenthesis:

```jq-try
program: '.user.id, .user | .name'
input: '{"user": {"id": 7, "name": "ada"}}'
error: 'Cannot index number with string ("name")'
caption: 'A common mistake: this is (.user.id, .user) | .name, and 7 has no name.'
```

```jq-try
program: '.user.id, (.user | .name)'
input: '{"user": {"id": 7, "name": "ada"}}'
caption: With parentheses, the pipe applies only to .user.
expected: [7, "ada"]
```

See [parenthesis](https://jqlang.org/manual/v1.8/#parenthesis).

## Generators

A filter that can produce more than one output is called a *generator*. `.[]` and `,` are
the two you have seen; `range`, `recurse` and many others follow later. Generators compose:
a generator on the right of a pipe runs for every output of a generator on the left, so the
counts multiply.

```jq-try
program: '.[] | .[]'
input: '[[1, 2], [3, 4, 5]]'
caption: Two arrays on the left, and each is iterated on the right; 2 + 3 = 5 outputs.
expected: [1, 2, 3, 4, 5]
```

```jq-try
program: '.store.books[] | .tags[]'
ref: static:bookstore
caption: Every tag of every book, one output each.
expected: ["jq", "cli", "beginner", "json", "data", "jq", "unix", "unix", "cli", "jq", "functional", "advanced", "data", "recipes", "regex", "jq", "advanced"]
```

The same happens with operators. When both operands of `+` produce several values, jq
evaluates the operator for every combination. The left operand varies fastest:

```jq-try
program: '(1, 2) + (10, 20)'
input: 'null'
caption: Four outputs, one per combination; 1+10, 2+10, 1+20, 2+20.
expected: [11, 12, 21, 22]
```

String interpolation behaves the same way, which can surprise you when a field unexpectedly
holds several values:

```jq-try
program: '"\(.a)-\(.b[])"'
input: '{"a": "x", "b": [1, 2, 3]}'
caption: .b[] produces three values, so the string is built three times.
expected: ["x-1", "x-2", "x-3"]
```

Thinking in streams makes such results predictable: count how many outputs each part
produces and multiply. See
[generators and iterators](https://jqlang.org/manual/v1.8/#generators-and-iterators).

## empty

`empty` is the filter that produces no outputs at all. It is not `null` and it is not an
empty array; it is the absence of any value.

```jq-try
program: '1, empty, 2'
input: 'null'
caption: empty contributes nothing to the stream.
expected: [1, 2]
```

Anything piped from `empty` never runs, because there is no output to run it on:

```jq-try
program: 'empty | "never printed"'
input: 'null'
caption: No outputs at all.
expected: []
```

In an array constructor, `empty` gives no element, which is different from `null`:

```jq-try
program: '[1, empty, 2], [1, null, 2]'
input: 'null'
caption: empty leaves no trace; null is a value.
expected: [[1, 2], [1, null, 2]]
```

`empty` is how a filter says "skip this one". A condition that produces `empty` on the
cases it does not want is exactly how `select` works, which *Select, map and empty*
explains:

```jq-try
program: '.[] | if . > 2 then . else empty end'
input: '[1, 5, 2, 8]'
caption: Keeping the values above 2 by producing nothing for the others.
expected: [5, 8]
```

See [empty](https://jqlang.org/manual/v1.8/#empty).

## Collecting a stream

When a program produces a stream and you want an array, wrap the generator in `[...]`. The
counts from above become lengths:

```jq-try
program: '[.store.books[] | .tags[]] | length'
ref: static:bookstore
caption: Collect every tag of every book, then count them.
expected: [17]
```

Array construction is covered in full in the next chapter, *Building values*.
