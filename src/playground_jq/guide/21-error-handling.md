---
title: Error handling
summary: Raising errors, catching them with try/catch and ?, falling back with //, and turning bad input into friendly messages.
level: 201
---

Real data is messy. A field that is usually a number is sometimes a string, an object is
sometimes `null`, a list is sometimes missing. jq reacts to most of these by raising an
error, which stops the program. This chapter is about deciding what should happen instead:
skip the bad value, replace it with a default, or report it in a way a person can act on.

## What an error is

An error in jq is a value travelling the "other way". When a filter fails, it does not
produce an output; it raises an error that unwinds the program until something catches it.
If nothing does, jq prints the message and exits with a non-zero status. Outputs produced
*before* the error have already been written.

You raise your own errors with [`error(message)`](https://jqlang.org/manual/v1.8/#error):

```jq-try
program: '.[] | if . < 0 then error("negative value: \(.)") else . end'
input: '[3, -1, 4]'
error: 'negative value: -1'
caption: 3 is printed, then -1 raises the error and 4 is never reached.
```

Built-in operations raise errors too: indexing a string with a field name, adding an object
to a number, parsing a word as a number.

```jq-try
program: '.a.b'
input: '{"a": "text"}'
error: Cannot index string
caption: 'Common mistake: .a is a string here, and strings have no fields.'
```

## try and catch

[`try body catch handler`](https://jqlang.org/manual/v1.8/#try-catch) runs `body`; if it
raises an error, `handler` runs with the *error message* as its input. Without a `catch`,
the error is simply swallowed and the expression produces nothing.

```jq-try
program: 'try error("boom") catch "caught: \(.)"'
input: 'null'
caption: 'Inside catch, . is the error message, not the original input.'
expected: ["caught: boom"]
```

```jq-try
program: 'map(try tonumber catch "invalid")'
input: '["10", "ten", "2.5"]'
caption: Each element is converted on its own; the one that fails is replaced.
expected: [[10, "invalid", 2.5]]
```

```jq-try
program: '[.[] | try tonumber]'
input: '["10", "ten", "2.5"]'
caption: With no catch, the failing element simply disappears.
expected: [[10, 2.5]]
```

The position of `try` matters when the body is a generator. An error ends the `try` it
happens in, and everything the body would still have produced is lost. Put the `try` inside
the iteration to handle each element separately:

```jq-try
program: '[.[] | try (if . == 2 then error("two") else . end) catch "bad"], [try (.[] | if . == 2 then error("two") else . end) catch "bad"]'
input: '[1, 2, 3]'
caption: 'First, try per element: 3 survives. Second, one try around the whole loop: it stops at the error.'
expected: [[1, "bad", 3], [1, "bad"]]
```

## The `?` operator

`f?` is shorthand for `try f`. It is most often attached to a path, where it means "if this
does not apply to the value, skip it". See
[Error suppression](https://jqlang.org/manual/v1.8/#error-suppression-optional-operator).

```jq-try
program: '[.[] | .name?]'
input: '[{"name": "a"}, "not an object", {"name": "b"}, null]'
caption: 'The string raises an error that ? suppresses; null has no name, which is just null.'
expected: [["a", "b", null]]
```

`.[]?` iterates when it can and quietly does nothing otherwise, which is handy for fields
that are sometimes a list and sometimes missing or scalar:

```jq-try
program: '[.[] | .tags[]?]'
input: '[{"tags": ["a", "b"]}, {"tags": null}, {"tags": "c"}, {}]'
caption: 'Only real arrays contribute; null, a string and a missing field are skipped.'
expected: [["a", "b"]]
```

`?` applies to the expression immediately to its left. It does not protect later steps of
a pipeline, so `.a? | tonumber` still fails on a non-numeric string. Group the whole step:

```jq-try
program: '.a? | tonumber'
input: '{"a": "x"}'
error: cannot be parsed as a number
caption: 'Common mistake: ? only guards .a, not the tonumber after it.'
```

```jq-try
program: '(.a | tonumber)?'
input: '{"a": "x"}'
caption: With the parentheses, the whole conversion is optional, and nothing is output.
expected: []
```

## Defaults with `//`

The [alternative operator](https://jqlang.org/manual/v1.8/#alternative-operator) `a // b`
outputs the values of `a` that are not `null` or `false`, and outputs `b` if there are none.
It is the everyday way to supply a default for a missing field.

```jq-try
program: 'map(.email // "(no email)")'
ref: static:users
caption: Ken's email is null, so the default is used for him.
expected: [["ada@example.org", "grace@example.org", "linus@example.org", "margaret@example.org", "(no email)", "barbara@example.org"]]
```

Combined with `?`, it gives "convert if you can, otherwise use this":

```jq-try
program: 'map((.value | tonumber)? // 0)'
input: '[{"value": "7"}, {"value": "n/a"}, {}]'
caption: 'n/a fails to parse and the missing value is null; both become 0.'
expected: [[7, 0, 0]]
```

Note that `//` is about empty, `null` and `false` results, not about errors. An error on its
left side still stops the program, which is why the `?` is needed above:

```jq-try
program: '.a.b // "none"'
input: '{"a": "text"}'
error: Cannot index string
caption: '// does not catch the error from indexing a string. Write (.a.b)? // "none".'
```

## Errors that carry data

The argument of `error` does not have to be a string. Any JSON value can be raised, and the
`catch` handler receives it unchanged. That lets you raise structured errors and inspect
them later:

```jq-try
program: 'try error({code: 404, message: "no such station"}) catch "\(.code): \(.message)"'
input: 'null'
caption: The handler receives the object and can pick fields out of it.
expected: ["404: no such station"]
```

`error` without an argument raises its input as the error, which is handy at the end of a
pipeline that builds the error value:

```jq-try
program: '[.[] | try (if .status >= 500 then {path, status} | error else "ok \(.path)" end) catch "failed: \(.path) (\(.status))"]'
input: '[{"path": "/a", "status": 200}, {"path": "/b", "status": 503}]'
caption: The object built for the failing request becomes the error value.
expected: [["ok /a", "failed: /b (503)"]]
```

A handler can also decide not to handle an error and raise it again with `error`. This is the
jq equivalent of catching only the exceptions you expect:

```jq-try
program: 'map(try (. + 1) catch (if test("cannot be added") then "skipped" else error end))'
input: '[1, "a", 41]'
caption: The type error is expected and replaced; any other error would still propagate.
expected: [[2, "skipped", 42]]
```

## Leaving early with label and break

[`label $name | ... break $name`](https://jqlang.org/manual/v1.8/#breaking-out-of-control-structures)
stops a generator from the inside. `break $name` ends the nearest enclosing `label $name`,
and the label expression produces nothing more. It is not an error, so nothing needs to catch
it.

```jq-try
program: '[label $found | .[] | if . > 6 then ., break $found else empty end]'
input: '[1, 5, 8, 12, 3]'
caption: Output the first value above 6 and stop scanning.
expected: [[8]]
```

The builtins `first(f)` and `limit(n; f)` are written with `label` and `break`, which is why
they can stop an infinite generator.

## Validating input and reporting problems

For data that comes from people or other systems, it is often better to collect every
problem than to stop at the first one. Build a list of messages per record and keep the
records that have any:

```jq-try
program: |
  [.[] | {username, problems: [
      (if .email == null then "no email" else empty end),
      (if .roles == [] then "no roles" else empty end),
      (if .active | not then "inactive" else empty end)
    ]}
   | select(.problems != [])]
ref: static:users
caption: Two users have problems; the others pass every check and are left out.
expected: [[{"username": "linus", "problems": ["inactive"]}, {"username": "ken", "problems": ["no email", "no roles"]}]]
```

When a check should stop processing, raise an error whose message names the record and the
field. A small helper keeps the call sites readable:

```jq-try
program: |
  def require($field): if .[$field] == null then error("\(.station): \($field) is missing") else . end;
  .readings[] | try (require("celsius") | "\(.station): \(.celsius)") catch .
ref: static:sensor-readings
caption: The offline station produces a readable message instead of stopping the whole run.
expected: ["FNA-01: 31.2", "FNA-02: 30.4", "BO-01: 33.8", "BO-02: celsius is missing", "KEN-01: 34.9", "KEN-02: 35.6", "MAK-01: 36.1", "PORT-01: 32.7", "PORT-02: 32.1"]
```

A common helper turns "does this raise an error" into a boolean. It is useful inside
`select`, where an error would otherwise abort the whole filter:

```jq-try
program: |
  def isvalid(f): try (f | true) catch false;
  map(select(isvalid(tonumber)))
input: '["1", "x", "2.5", "", "1e3"]'
caption: Keep the strings that parse as numbers. Note that isvalid(f) outputs nothing when f outputs nothing.
expected: [["1", "2.5", "1e3"]]
```

## Summary

| Tool | What it does |
| --- | --- |
| `error(msg)`, `error` | raise an error with a message or with the input |
| `try f catch g` | run `f`; on error run `g` with the message as input |
| `try f`, `f?` | run `f`; on error produce nothing |
| `a // b` | `b` when `a` gives only `null`, `false` or nothing (errors still propagate) |
| `label $l \| ... break $l` | stop a generator early, without an error |
