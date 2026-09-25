---
title: Operators
summary: Arithmetic on numbers, strings, arrays and objects, merging objects, the alternative operator // and operator precedence.
level: 101
---

jq's arithmetic operators, `+ - * / %`, work on more than numbers. Each is defined for
particular combinations of types, and what it does depends on those types: `+` adds numbers,
concatenates strings and arrays, and merges objects. Any combination that is not defined is
an error rather than a silent conversion. This chapter goes through each operator by type,
then covers the alternative operator `//` and the precedence of everything.

Like every jq expression, an operator runs both of its operands against the same input:
in `.price * .qty`, both `.price` and `.qty` are fields of the current input.

## Numbers

On numbers the operators do what you expect, using 64-bit floating point. `/` always gives
the exact quotient (there is no integer division), and `%` works on the integer parts of its
operands, with the sign of the left operand:

```jq-try
program: '7 + 2, 7 - 2, 7 * 2, 7 / 2, 7 % 2, -7 % 2'
input: 'null'
caption: The five operators on numbers.
expected: [9, 5, 14, 3.5, 1, -1]
```

```jq-try
program: '.store.books[] | {title, value: (.price * .inStock)}'
ref: static:bookstore
caption: The stock value of each book, from two fields of the same input.
expected: [{"title": "Learning jq", "value": 102}, {"title": "JSON at Scale", "value": 0}, {"title": "Pipes and Paths", "value": 18.75}, {"title": "The Art of the Shell", "value": 223.29999999999998}, {"title": "Functional Filters", "value": 99.94999999999999}, {"title": "Data Wrangling Recipes", "value": 0}, {"title": "Regular Expressions Unleashed", "value": 198}, {"title": "Streams and Generators", "value": 27.75}]
```

Dividing by zero is an error, not infinity:

```jq-try
program: '.total / .count'
input: '{"total": 10, "count": 0}'
error: 'the divisor is zero'
caption: Division by zero stops the program.
```

See [addition](https://jqlang.org/manual/v1.8/#addition),
[subtraction](https://jqlang.org/manual/v1.8/#subtraction) and
[multiplication, division, modulo](https://jqlang.org/manual/v1.8/#multiplication-division-modulo).

## null in addition

`null` is the identity for `+`: adding `null` to anything gives the other value unchanged.
This makes `+` safe on missing fields, and is why `add` works on arrays with gaps:

```jq-try
program: 'null + 1, 1 + null, null + "text", null + null'
input: 'null'
caption: null disappears in an addition.
expected: [1, 1, "text", null]
```

It applies only to `+`. `null - 1` and `null * 2` are errors.

## Strings

`+` joins two strings. `*` with a number repeats a string. `/` splits a string on a
separator, the same as `split`:

```jq-try
program: '.first + " " + .last'
input: '{"first": "Ada", "last": "Lovelace"}'
caption: Concatenation with +.
expected: ["Ada Lovelace"]
```

```jq-try
program: '"ab" * 3, ("a,b,c" / ",")'
input: 'null'
caption: Repetition with *, splitting with /.
expected: ["ababab", ["a", "b", "c"]]
```

Numbers are not converted to strings automatically. Concatenating a number is an error; use
`tostring`, or string interpolation (covered with strings later in the guide):

```jq-try
program: '.name + " is " + .age'
input: '{"name": "Ada", "age": 36}'
error: 'cannot be added'
caption: 'A common mistake: a string and a number cannot be added.'
```

```jq-try
program: '.name + " is " + (.age | tostring)'
input: '{"name": "Ada", "age": 36}'
caption: Converting the number first.
expected: ["Ada is 36"]
```

## Arrays

`+` concatenates arrays. `-` removes from the left array every element that occurs in the
right array, all occurrences of it:

```jq-try
program: '[1, 2] + [2, 3], [1, 2, 3, 2, 1] - [2], ["a", "b", "c"] - ["a", "c"]'
input: 'null'
caption: Concatenation keeps duplicates; difference removes every copy.
expected: [[1, 2, 2, 3], [1, 3, 1], ["b"]]
```

The right operand of `-` must itself be an array, even for one element:

```jq-try
program: '.tags - "cli"'
input: '{"tags": ["jq", "cli", "beginner"]}'
error: 'cannot be subtracted'
caption: 'A common mistake: write .tags - ["cli"].'
```

```jq-try
program: '[.store.books[].tags[]] - ["jq"] | unique'
ref: static:bookstore
caption: All tags except jq, deduplicated with unique.
expected: [["advanced", "beginner", "cli", "data", "functional", "json", "recipes", "regex", "unix"]]
```

## Objects: merge and deep merge

`+` merges two objects. Keys from the right object are added to the left one, and where
both have the same key, the right value wins. The merge is shallow: a nested object on the
right replaces the nested object on the left entirely.

```jq-try
program: '{"a": 1, "b": 2} + {"b": 20, "c": 30}'
input: 'null'
caption: The right side wins on b.
expected: [{"a": 1, "b": 20, "c": 30}]
```

`*` merges recursively. Where both sides hold an object under the same key, those objects
are merged too, at every depth; for anything else the right side wins as with `+`:

```jq-try
program: '.defaults + .override, .defaults * .override'
input: '{"defaults": {"db": {"host": "localhost", "port": 5432}, "debug": false}, "override": {"db": {"host": "db.prod"}}}'
caption: With + the whole db object is replaced and port is lost; with * it is kept.
expected: [{"db": {"host": "db.prod"}, "debug": false}, {"db": {"host": "db.prod", "port": 5432}, "debug": false}]
```

Deep merge is the usual way to apply configuration overrides. Arrays are not merged
element by element; an array on the right replaces the one on the left.

`-` is not defined for objects. To remove keys, use `del`, covered later in the guide.

## The alternative operator: //

`a // b` produces the outputs of `a` that are not `false` or `null`. If `a` produces no such
output (every output was `false` or `null`, or there were none at all), it produces the
outputs of `b` instead. It is jq's way of giving a default:

```jq-try
program: '.[] | .nickname // .name'
input: '[{"name": "Ada", "nickname": "Countess"}, {"name": "Grace"}, {"name": "Linus", "nickname": null}]'
caption: The nickname if there is one, otherwise the name.
expected: ["Countess", "Grace", "Linus"]
```

The test is truthiness, not "missing". `0`, `""` and `[]` are kept, but `false` is replaced
just like `null`:

```jq-try
program: '[false // "d", null // "d", 0 // "d", "" // "d", [] // "d"]'
input: 'null'
caption: Only false and null are replaced.
expected: [["d", "d", 0, "", []]]
```

That makes `//` wrong for boolean fields, where `false` is a real value:

```jq-try
program: '.[] | .active // true'
input: '[{"active": false}, {"active": true}, {}]'
caption: 'A common mistake: the explicit false becomes true. Use if .active == null then true else .active end.'
expected: [true, true, true]
```

When the left side produces several values, `//` keeps all the truthy ones and only falls
back when there are none. It is not "first value or default":

```jq-try
program: '[(false, 2, null, 3) // 4], [(null, false) // 4], [empty // 4]'
input: 'null'
caption: Several truthy values are all kept; no truthy value, or no value, gives the default.
expected: [[2, 3], [4], [4]]
```

`//` does not catch errors. If evaluating the left side fails, the error propagates:

```jq-try
program: '.name.first // "unknown"'
input: '{"name": "Ada"}'
error: 'Cannot index string with'
caption: 'The error is not a null, so there is no fallback. Use .name.first? // "unknown".'
```

```jq-try
program: '.[] | .preferences.theme // "default"'
ref: static:users
caption: A default for the user without preferences.
expected: ["dark", "light", "dark", "default", "dark", "light"]
```

See [alternative operator](https://jqlang.org/manual/v1.8/#alternative-operator).

## Precedence

From loosest to tightest binding:

| Operators | Notes |
| --- | --- |
| `\|` | Pipe; right-associative. |
| `,` | Comma. |
| `//` | Alternative; right-associative. |
| `=`, `\|=`, `+=`, ... | Assignment (covered later). |
| `or` | |
| `and` | |
| `==`, `!=`, `<`, `<=`, `>`, `>=` | Comparison; cannot be chained. |
| `+`, `-` | Left-associative. |
| `*`, `/`, `%` | Left-associative. |

So `*` binds tighter than `+`, arithmetic binds tighter than `//`, and everything binds
tighter than `,` and `|`:

```jq-try
program: '2 + 3 * 4, (2 + 3) * 4, 10 - 2 - 3'
input: 'null'
caption: Usual arithmetic precedence and left associativity.
expected: [14, 20, 5]
```

Because `//` binds looser than arithmetic, a default next to an operator usually needs
parentheses:

```jq-try
program: '.count // 0 + 1, (.count // 0) + 1'
input: '{"count": 5}'
caption: The first is .count // (0 + 1), so the count comes out unchanged. The second adds 1 to it.
expected: [5, 6]
```

```jq-try
program: '.a // "none" | ascii_upcase'
input: '{"a": null}'
caption: The pipe binds loosest, so the default is applied before ascii_upcase.
expected: ["NONE"]
```

When in doubt, add parentheses. They cost nothing and make the intended grouping visible.
Comparison and the boolean operators are covered in the next chapter, *Conditionals and
comparisons*.
