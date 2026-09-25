---
title: Values and types
summary: The six JSON types, the type builtin, truthiness, and how jq 1.8 handles numbers.
level: 101
---

jq works on JSON values and nothing else. Every input, every intermediate result and every
output is one of the six JSON types:

| Type | Examples | Notes |
| --- | --- | --- |
| null | `null` | The absence of a value. Also what a missing key gives. |
| boolean | `true`, `false` | |
| number | `1`, `-2.5`, `1e3` | One numeric type; no separate integers. |
| string | `"jq"`, `"Tromsø"` | Unicode text. |
| array | `[1, "a", null]` | Ordered, elements of any type. |
| object | `{"name": "jq"}` | Keys are always strings; values are of any type. |

There are no dates, no bytes, no sets and no undefined in jq. Dates are strings or numbers
that builtins know how to read, and anything else must be modelled with the six types. See
[Types and values](https://jqlang.org/manual/v1.8/#types-and-values) in the manual.

## Literals

Any JSON value can be written directly in a program. A literal ignores its input and
produces itself, which is handy for trying things out:

```jq-try
program: '[null, true, 42, "text", [1, 2], {"k": "v"}]'
input: 'null'
caption: A program made only of a literal outputs that literal.
expected: [[null, true, 42, "text", [1, 2], {"k": "v"}]]
```

jq also accepts some conveniences that JSON does not: object keys that are simple
identifiers need no quotes in a program, and there are string escapes and interpolation
(covered with strings later in the guide).

```jq-try
program: '{name: "jq", tags: ["json", "cli"]}'
input: 'null'
caption: Unquoted keys are allowed in a program. The output is still plain JSON.
expected: [{"name": "jq", "tags": ["json", "cli"]}]
```

## type

The `type` builtin gives the name of its input's type as a string. It is the basis of most
type checks.

```jq-try
program: '.[] | type'
input: '[null, true, 42, "text", [1, 2], {"k": "v"}]'
caption: One type name per element.
expected: ["null", "boolean", "number", "string", "array", "object"]
```

```jq-try
program: '.store | map_values(type)'
ref: static:bookstore
caption: The type of each field of the store.
expected: [{"name": "string", "location": "object", "open": "boolean", "books": "array", "staff": "array"}]
```

There are also selector builtins named after the types, such as `numbers`, `strings`,
`arrays`, `objects`, `booleans`, `nulls`, `iterables` and `scalars`. Each passes its input
through if it has that type and produces nothing otherwise:

```jq-try
program: '[.[] | numbers]'
input: '[1, "2", 3, null, 4.5]'
caption: Keep only the numbers. The string "2" is not a number.
expected: [[1, 3, 4.5]]
```

See [type](https://jqlang.org/manual/v1.8/#type) and
[the type selectors](https://jqlang.org/manual/v1.8/#arrays-objects-iterables-booleans-numbers-normals-finites-strings-nulls-values-scalars).

## null

`null` is an ordinary value, but it shows up in two special roles. First, asking an object
for a key it does not have gives `null` rather than an error:

```jq-try
program: '.email'
input: '{"name": "ken", "email": null}'
caption: The key exists and holds null.
expected: [null]
```

```jq-try
program: '.phone'
input: '{"name": "ken", "email": null}'
caption: The key does not exist. The result is the same null.
expected: [null]
```

So `null` cannot tell you whether a key was missing or set to null; use `has("key")` when the
difference matters. Second, `null` is falsy, which the next section explains.

## Truthiness

Conditions in jq (`if`, `select`, `and`, `or`, `not`, `//`) need a true or false answer, and
any value can serve as one. The rule is short: **`false` and `null` are falsy; every other
value is truthy.** That includes `0`, the empty string, the empty array and the empty
object, which are falsy in many other languages.

```jq-try
program: 'map(if . then "truthy" else "falsy" end)'
input: '[0, "", [], {}, null, false, "false"]'
caption: Only null and false are falsy. The string "false" is truthy.
expected: [["truthy", "truthy", "truthy", "truthy", "falsy", "falsy", "truthy"]]
```

```jq-try
program: 'map(not)'
input: '[true, false, null, 0, ""]'
caption: not turns truthy into false and falsy into true.
expected: [[false, true, true, false, false]]
```

This means `select(.count)` keeps objects whose count is `0`: zero is truthy. To test for a
non-zero number, compare explicitly: `select(.count > 0)`.

```jq-try
program: '.[] | select(.inStock) | .title'
input: '[{"title": "A", "inStock": 0}, {"title": "B", "inStock": 3}, {"title": "C", "inStock": null}]'
caption: 'A common mistake: select(.inStock) keeps A, because 0 is truthy. Only C (null) is dropped.'
expected: ["A", "B"]
```

## Numbers

JSON has one number type and so does jq. There is no integer division and no separate
integer type: `3 / 2` is `1.5`, and `1` and `1.0` are equal.

```jq-try
program: '3 / 2, 1 == 1.0, 0.1 + 0.2'
input: 'null'
caption: Arithmetic uses 64-bit floating point, with its usual rounding.
expected: [1.5, true, 0.30000000000000004]
```

Arithmetic in jq is done in IEEE 754 double precision, which represents integers exactly
only up to 2^53 (9007199254740992). Numeric IDs from other systems are often larger than
that.

### Large numbers in jq 1.8

jq 1.8 keeps the original text of a number literal from the input as long as the number is
not changed. A large ID passes through unmodified, and converting it to a string gives the
exact digits:

```jq-try
program: '.id | tostring'
input: '{"id": 12345678901234567890}'
caption: The literal is preserved exactly while it is not modified.
expected: ["12345678901234567890"]
```

As soon as a number takes part in arithmetic, it is converted to a double and the extra
digits are lost:

```jq-try
program: '.id + 1 | tostring'
input: '{"id": 12345678901234567890}'
caption: After arithmetic, only about 17 significant digits survive.
expected: ["12345678901234567000"]
```

```jq-try
program: 'tojson'
input: '{"id": 12345678901234567890, "big": 100000000000000000001}'
caption: tojson writes the preserved literals unchanged.
expected: ["{\"id\":12345678901234567890,\"big\":100000000000000000001}"]
```

Comparisons between two unmodified literals are exact in jq 1.8, but once the numbers have
been through arithmetic, two different large IDs can become equal:

```jq-try
program: '.a == .b, (.a + 0) == (.b + 0)'
input: '{"a": 12345678901234567890, "b": 12345678901234567891}'
caption: The literals differ; after adding 0 both are the same double.
expected: [false, true]
```

If exact large integers matter, keep them as strings in your data, or never do arithmetic on
them. Older jq versions (1.6 and earlier) converted every number on input, so `jq .` printed
`12345678901234567890` as `12345678901234567000`; keep this in mind when reading old answers
online.

## Strings

Strings are sequences of Unicode code points. `length` counts code points, not bytes; the
separate `utf8bytelength` counts the bytes of the UTF-8 encoding.

```jq-try
program: 'length, utf8bytelength'
input: '"Tromsø"'
caption: Six characters, seven bytes (ø takes two bytes in UTF-8).
expected: [6, 7]
```

A string that looks like a number is still a string. jq never converts between types behind
your back:

```jq-try
program: '"2" + 1'
input: 'null'
error: 'string ("2") and number (1) cannot be added'
caption: 'A common mistake: jq does not coerce "2" to a number.'
```

Use `tonumber` and `tostring` to convert explicitly; both are covered with strings later in
the guide.

```jq-try
program: '("2" | tonumber) + 1, (42 | tostring)'
input: 'null'
caption: Explicit conversion in both directions.
expected: [3, "42"]
```

## Arrays and objects

Arrays hold values of any type in order. Objects map string keys to values. Object keys are
always strings in JSON, and jq refuses to build an object with a key of any other type:

```jq-try
program: '{(1): "one"}'
input: 'null'
error: 'Cannot use number (1) as object key'
caption: A computed key must be a string.
```

```jq-try
program: '{(1 | tostring): "one"}'
input: 'null'
caption: Converting the key first works.
expected: [{"1": "one"}]
```

The next chapters show how to take arrays and objects apart (*Identity and fields*, *Arrays
and slices*) and how to build them (*Building values*).
