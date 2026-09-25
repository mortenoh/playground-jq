---
title: Generators and control flow
summary: Producing, limiting and combining streams of values with range, limit, first, until, while, repeat, label/break and input/inputs.
level: 301
---

A jq filter does not return one value; it produces a *stream* of zero or more values. A
filter that produces many is called a generator: `.[]`, the comma, `range`, `recurse` and
`inputs` are all generators. Most of jq's control flow is about shaping these streams: taking
the first few, stopping when a condition holds, running a loop until it converges, or
combining two streams into all their pairs.

Because streams are lazy, a generator can be infinite as long as something downstream stops
it. That is the key to reading the functions in this chapter.

The manual sections are [Generators and iterators](https://jqlang.org/manual/v1.8/#generators-and-iterators)
and the entries for each builtin linked below.

## range

[`range`](https://jqlang.org/manual/v1.8/#range) produces numbers. `range(n)` counts from 0
up to, but not including, `n`; `range(from; upto)` sets the start; `range(from; upto; by)`
sets the step, which may be negative.

```jq-try
program: '[range(5)], [range(2; 10; 3)], [range(5; 0; -2)]'
input: 'null'
caption: The upper bound is never included, in either direction.
expected: [[0, 1, 2, 3, 4], [2, 5, 8], [5, 3, 1]]
```

Ranges are useful for index arithmetic, for example to take every third element of a list:

```jq-try
program: '.store.books | [range(0; length; 3) as $i | .[$i].title]'
ref: static:bookstore
caption: Books at positions 0, 3 and 6.
expected: [["Learning jq", "The Art of the Shell", "Regular Expressions Unleashed"]]
```

## Taking part of a stream: limit, first, last, nth, skip

[`limit(n; f)`](https://jqlang.org/manual/v1.8/#limit) outputs at most `n` values of `f` and
then stops `f`. That makes it safe to use on infinite generators:

```jq-try
program: '[limit(5; range(1; infinite))]'
input: 'null'
caption: range(1; infinite) never ends on its own; limit stops it after five values.
expected: [[1, 2, 3, 4, 5]]
```

[`first(f)`, `last(f)` and `nth(n; f)`](https://jqlang.org/manual/v1.8/#first-last-nth-2)
pick single values out of a stream. `first(f)` stops `f` after one value, so it is the
efficient way to ask "find the first match":

```jq-try
program: '[first(.store.books[] | select(.price > 20) | .title), last(.store.books[] | select(.price > 20) | .title), nth(1; .store.books[] | select(.price > 20) | .title)]'
ref: static:bookstore
caption: Four books cost more than 20; the first, the last, and the second (nth counts from 0).
expected: [["JSON at Scale", "Streams and Generators", "The Art of the Shell"]]
```

The generator forms `first(f)` and the array forms `first`, `.[0]` differ when there is
nothing to take. A stream with no values has no first value, so `first(empty)` outputs
nothing, while `first` on an empty array is `.[0]`, which is `null`:

```jq-try
program: '[first(empty)], [[] | first]'
input: 'null'
caption: Nothing, versus null.
expected: [[], [null]]
```

`nth` does not accept negative positions, and says so:

```jq-try
program: 'nth(-1; 1, 2, 3)'
input: 'null'
error: "doesn't support negative indices"
caption: 'Common mistake: use last(f) for the final value, not nth(-1; f).'
```

jq 1.8 added [`skip(n; f)`](https://jqlang.org/manual/v1.8/#skip), the counterpart of
`limit`. Together they page through a stream:

```jq-try
program: '[limit(3; skip(2; .employees[] | .name))]'
ref: static:employees
caption: 'Skip two, take three: the third to fifth employees.'
expected: [["Chiara", "Dmitri", "Efua"]]
```

## Loops: until, while, repeat

[`until(cond; update)`](https://jqlang.org/manual/v1.8/#until) applies `update` until `cond`
is true and outputs only the final value. It is a loop with state, where the state is `.`:

```jq-try
program: '{n: ., steps: 0} | until(.n == 1; .n |= (if . % 2 == 0 then . / 2 else 3 * . + 1 end) | .steps += 1) | .steps'
input: '27'
caption: The Collatz sequence from 27 takes 111 steps to reach 1.
expected: [111]
```

[`while(cond; update)`](https://jqlang.org/manual/v1.8/#while) is the same loop, but it
outputs every intermediate value while `cond` holds, so it is a generator:

```jq-try
program: '[[0, 1] | while(.[0] < 50; [.[1], add]) | .[0]]'
input: 'null'
caption: 'The state is a pair [a, b]; each step moves to [b, a + b]. Fibonacci numbers below 50.'
expected: [[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]]
```

[`repeat(f)`](https://jqlang.org/manual/v1.8/#repeat) runs `f` against the same input over
and over, forever. In jq 1.8 it is defined as `def repeat(f): def _repeat: f, _repeat; _repeat;`:
the results are *not* fed back into `f`. It is always combined with something that stops it,
such as `limit`, `first`, `label`/`break` or an error.

```jq-try
program: '[limit(4; repeat(. * 2))], [limit(5; recurse(. * 2))]'
input: '1'
caption: 'repeat applies . * 2 to 1 every time; recurse feeds each result back in.'
expected: [[2, 2, 2, 2], [1, 2, 4, 8, 16]]
```

The natural partner of `repeat` is a filter with a side effect, like reading the next input.
`repeat(input)` keeps reading until `input` fails at the end of the data, and `try` turns that
failure into the end of the stream:

```jq-try
program: '[try repeat(input)]'
input: '1 2 3'
options: {null_input: true}
caption: 'Equivalent to [inputs]: read everything, stop at the error raised when the input runs out.'
expected: [[1, 2, 3]]
```

## Is there anything at all? isempty

[`isempty(f)`](https://jqlang.org/manual/v1.8/#isempty) is `true` when `f` produces no values.
It stops `f` at the first value, so it is cheap even for large generators:

```jq-try
program: '[.employees[] | select(.skills | isempty(.[])) | .name]'
ref: static:employees
caption: The one employee with an empty skills list.
expected: [["Jonas"]]
```

## Stopping from the inside: label and break

`label $name | f` runs `f`, and anywhere inside it `break $name` ends the label: the whole
labelled expression produces nothing further. This is how `limit` and `first` are written,
and you can use it directly for "read until a sentinel":

```jq-try
program: '[label $done | .[] | if . == "END" then break $done else . end]'
input: '["a", "b", "END", "c"]'
caption: Everything before the sentinel; c is never reached.
expected: [["a", "b"]]
```

`break` can only refer to a label that encloses it. It is not meant to be handled, but jq
implements it much like an error on its way out to the label, so a `try` placed between the
`break` and its `label` swallows it (the handler receives an internal `{"__jq": ...}` object) and the loop carries on:

```jq-try
program: '[label $done | .[] | try (if . == "END" then break $done else . end) catch "caught"]'
input: '["a", "b", "END", "c"]'
caption: 'Common mistake: the try around the break catches it, so c is still reached. Keep break outside any try.'
expected: [["a", "b", "caught", "c"]]
```

## Reading input values: input and inputs

Normally jq runs the program once per input value. With `-n` (`null_input`), the program runs
once with `null` as input, and pulls values itself with
[`input`](https://jqlang.org/manual/v1.8/#input) (the next one) and
[`inputs`](https://jqlang.org/manual/v1.8/#inputs) (all remaining ones, as a generator).
This lets a single run see every value while holding only what it needs:

```jq-try
program: 'reduce inputs as $n (0; . + $n)'
input: '1 2 3 4'
options: {null_input: true}
caption: One run adds up four separate input values.
expected: [10]
```

`input` takes one value, which is useful for a header line or a baseline:

```jq-try
program: 'input as $first | [inputs | . - $first]'
input: '100 103 99 110'
options: {null_input: true}
caption: The first value is the baseline; the rest are shown relative to it.
expected: [[3, -1, 10]]
```

With newline-delimited JSON such as the access log, `-n` plus `inputs` filters the whole file
in one program without slurping it into an array first:

```jq-try
program: '[inputs | select(.status >= 500) | "\(.service) \(.path)"]'
ref: static:access-log
options: {null_input: true}
caption: Three server errors, collected into one array.
expected: [["api /v1/alerts", "worker job:refresh-radar", "api /v1/alerts"]]
```

Asking for more input than there is raises an error. Catch it when running out is expected:

```jq-try
program: '[input, input, (try input catch "none left")]'
input: '1 2'
options: {null_input: true}
caption: The third call has nothing to read; the catch supplies a marker instead.
expected: [[1, 2, "none left"]]
```

## getpath with generators

[`getpath(p)`](https://jqlang.org/manual/v1.8/#getpath) accepts a generator of paths and
produces one value per path. A path that does not exist gives `null` rather than an error:

```jq-try
program: '[getpath(["a", "b"], ["a", "c"], ["x", "y"])]'
input: '{"a": {"b": 1, "c": 2}}'
caption: Three paths, three values; the missing one is null.
expected: [[1, 2, null]]
```

Combined with `paths`, this pairs every location with its value:

```jq-try
program: '[paths(numbers) as $p | {path: ($p | join(".")), value: getpath($p)}]'
input: '{"server": {"port": 8080, "timeouts": {"read": 30}}, "name": "api"}'
caption: Only the numeric leaves, with their dotted paths.
expected: [[{"path": "server.port", "value": 8080}, {"path": "server.timeouts.read", "value": 30}]]
```

## Combining generators

When two generators appear in one expression, jq produces every combination. Binding with
`as` makes a nested loop:

```jq-try
program: '[("S", "M", "L") as $size | ("red", "blue") as $colour | "\($size)-\($colour)"]'
input: 'null'
caption: Three sizes times two colours; the first generator is the outer loop.
expected: [["S-red", "S-blue", "M-red", "M-blue", "L-red", "L-blue"]]
```

Object construction does the same with generator values, which surprises many people:

```jq-try
program: '[{a: (1, 2), b: (3, 4)}]'
input: 'null'
caption: Two choices for a and two for b give four objects.
expected: [[{"a": 1, "b": 3}, {"a": 1, "b": 4}, {"a": 2, "b": 3}, {"a": 2, "b": 4}]]
```

A dependent inner loop uses the outer value:

```jq-try
program: '[range(1; 4) as $x | range($x) | [$x, .]]'
input: 'null'
caption: For each x, count from 0 below x.
expected: [[[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2]]]
```

[`foreach`](https://jqlang.org/manual/v1.8/#foreach) walks a generator with a state and emits
something at every step, which gives running totals and similar "scan" results:

```jq-try
program: '[foreach .employees[] as $e (0; . + $e.salary; {name: $e.name, running: .})] | .[0:4]'
ref: static:employees
caption: The payroll accumulated employee by employee.
expected: [[{"name": "Astrid", "running": 150000}, {"name": "Bjorn", "running": 248000}, {"name": "Chiara", "running": 353000}, {"name": "Dmitri", "running": 463000}]]
```

## Summary

| Function | Outputs |
| --- | --- |
| `range(n)`, `range(a; b; step)` | numbers, upper bound excluded |
| `limit(n; f)`, `skip(n; f)` | the first `n` values of `f` / all but the first `n` |
| `first(f)`, `last(f)`, `nth(n; f)` | one value of `f`, or nothing |
| `until(cond; update)` | the final state |
| `while(cond; update)` | every state while `cond` holds |
| `repeat(f)` | `f` of the same input, forever |
| `isempty(f)` | `true` or `false` |
| `label $l \| ... break $l` | whatever was produced before the break |
| `input`, `inputs` | the next input value / all remaining ones |
