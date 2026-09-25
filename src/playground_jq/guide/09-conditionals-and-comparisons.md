---
title: Conditionals and comparisons
summary: if-then-elif-else-end, equality and ordering, the order of values across types, and the boolean operators and, or and not.
level: 101
---

Programs need to make decisions: label a value, pick one field or another, keep some items
and drop others. This chapter covers the pieces for that: the conditional expression, the
comparison operators, how jq orders values of different types, and the boolean operators.
The next chapter builds `select` on top of them.

## if-then-else-end

`if A then B else C end` runs the condition `A` against the input. If the result is truthy
(anything except `false` and `null`, see *Values and types*), it runs `B`, otherwise `C`.
Both branches receive the same input as the condition.

```jq-try
program: '.[] | if . >= 0 then "non-negative" else "negative" end'
input: '[3, -1, 0]'
caption: One label per number.
expected: ["non-negative", "negative", "non-negative"]
```

`elif` adds further conditions, tested in order; the first truthy one wins:

```jq-try
program: '.store.books[] | {title, band: (if .price < 10 then "cheap" elif .price < 25 then "mid" else "premium" end)}'
ref: static:bookstore
caption: A price band for every book.
expected: [{"title": "Learning jq", "band": "cheap"}, {"title": "JSON at Scale", "band": "mid"}, {"title": "Pipes and Paths", "band": "cheap"}, {"title": "The Art of the Shell", "band": "premium"}, {"title": "Functional Filters", "band": "mid"}, {"title": "Data Wrangling Recipes", "band": "mid"}, {"title": "Regular Expressions Unleashed", "band": "mid"}, {"title": "Streams and Generators", "band": "premium"}]
```

`if` is an expression that produces a value, not a statement, so it can appear anywhere a
value can: inside an object, as an argument, on either side of a pipe. Use parentheses when
it is a value in an object constructor, as above.

### Optional else

In jq 1.7 and later, the `else` branch can be left out. `if A then B end` means
`if A then B else . end`: when the condition is falsy, the input passes through unchanged.

```jq-try
program: '.[] | if . > 10 then "big" end'
input: '[3, 12]'
caption: 3 fails the condition and passes through unchanged.
expected: [3, "big"]
```

This is convenient for fixing up some values and leaving the rest alone:

```jq-try
program: 'map(if type == "string" then tonumber end)'
input: '[1, "2", 3, "4.5"]'
caption: Convert the strings, keep the numbers as they are.
expected: [[1, 2, 3, 4.5]]
```

### Conditions that produce several values

If the condition produces several outputs, the `if` runs once for each of them. This is
rarely intended, and is usually a sign that the condition should use `any` or `all`
(covered later in the guide):

```jq-try
program: 'if .tags[] == "jq" then "about jq" else "other" end'
input: '{"tags": ["jq", "cli", "beginner"]}'
caption: 'Three tags, so three outputs. Use if any(.tags[]; . == "jq") ... for one answer.'
expected: ["about jq", "other", "other"]
```

See [if-then-else-end](https://jqlang.org/manual/v1.8/#if-then-else-end).

## Equality: == and !=

`==` compares two values for deep equality: same type and same content, recursively.
Object key order does not matter, array element order does. Numbers compare by value, so
`1 == 1.0`:

```jq-try
program: '{"a": 1, "b": [1, 2]} == {"b": [1, 2], "a": 1}, [1, 2] == [2, 1], 1 == 1.0'
input: 'null'
caption: Objects compare regardless of key order; arrays do not.
expected: [true, false, true]
```

There is no type coercion. A string is never equal to a number:

```jq-try
program: '.[] | select(.id == 2) | .name'
input: '[{"id": "1", "name": "a"}, {"id": "2", "name": "b"}]'
caption: 'A common mistake: the ids are strings, so nothing matches. Compare with "2", or use (.id | tonumber) == 2.'
expected: []
```

See [== and !=](https://jqlang.org/manual/v1.8/#==-!=).

## Ordering: <, <=, >, >=

The ordering operators compare numbers numerically and strings by Unicode code point, so
uppercase letters come before lowercase ones and `"10"` comes before `"9"`:

```jq-try
program: '3 < 10, "B" < "a", "10" < "9", "apple" < "banana"'
input: 'null'
caption: String comparison is by character code, not by numeric value or dictionary order.
expected: [true, true, true, true]
```

Arrays compare element by element, like words in a dictionary; a prefix comes before a
longer array. Objects first compare their sorted key lists, and only if those are equal their
values, key by key.

```jq-try
program: '[1, 2] < [1, 3], [1, 2] < [1, 2, 0], {"a": 1} < {"a": 2}, {"a": 9} < {"b": 0}'
input: 'null'
caption: All true. The last compares the key lists ["a"] and ["b"] and never looks at the values.
expected: [true, true, true, true]
```

Comparisons cannot be chained. `1 < x < 10` is a syntax error; write `1 < x and x < 10`.
See [comparison operators](https://jqlang.org/manual/v1.8/#>->=-<=-<).

## Ordering across types

Any two jq values can be compared, even of different types. Types are ordered first, in this
order, and values of the same type are then compared as above:

| Rank | Type |
| --- | --- |
| 1 | `null` |
| 2 | `false` |
| 3 | `true` |
| 4 | numbers |
| 5 | strings |
| 6 | arrays |
| 7 | objects |

`sort` uses the same order, which shows it at a glance:

```jq-try
program: 'sort'
input: '[{}, [], "a", 1, true, false, null]'
caption: Sorted from null to objects.
expected: [[null, false, true, 1, "a", [], {}]]
```

```jq-try
program: 'null < false, false < true, true < 0, 1000 < "0", "zzz" < [], [99] < {}'
input: 'null'
caption: Every value of an earlier type is less than every value of a later one.
expected: [true, true, true, true, true, true]
```

This total order means comparisons never fail, but it also means a comparison between the
wrong types silently gives an answer. A number is always less than a string, so comparing a
numeric field that is sometimes stored as a string gives results that look random:

```jq-try
program: '[.[] | select(.celsius > 30)]'
input: '[{"station": "A", "celsius": 31.2}, {"station": "B", "celsius": "12.5"}, {"station": "C", "celsius": 28}]'
caption: 'A common mistake: "12.5" is a string, and every string is greater than 30.'
expected: [[{"station": "A", "celsius": 31.2}, {"station": "B", "celsius": "12.5"}]]
```

## and, or, not

`and` and `or` combine conditions. Both operands are tested for truthiness and the result is
always a boolean:

```jq-try
program: '.[] | select(.active and (.roles | length) > 0) | .username'
ref: static:users
caption: Active users with at least one role.
expected: ["ada", "grace", "margaret", "barbara"]
```

```jq-try
program: '[true and null, 1 and "x", false or 0, null or false]'
input: 'null'
caption: The results are booleans, never the operands themselves.
expected: [[false, true, true, false]]
```

Both operators short-circuit: `and` does not evaluate its right side when the left is falsy,
and `or` does not when the left is truthy. That makes it safe to guard a check that would
otherwise fail:

```jq-try
program: '.[] | (type == "object" and .ok == true)'
input: '[{"ok": true}, "text", {"ok": false}]'
caption: For the string, .ok is never evaluated, so there is no error.
expected: [true, false, false]
```

`not` is a filter, not an operator: it takes its input and negates its truthiness. Write it
after a pipe, `(... | not)`, not in front of the expression:

```jq-try
program: '.[] | select(.active | not) | .username'
ref: static:users
caption: The inactive users. There is exactly one.
expected: ["linus"]
```

```jq-try
program: '.[] | select(not .active)'
ref: static:users
error: 'Cannot index boolean with'
caption: 'A common mistake: jq reads this as (not).active. not negates the user object, giving false, and false has no .active field.'
```

Precedence: `and` binds tighter than `or`, and both bind looser than comparisons, so
`.a == 1 or .b == 2 and .c == 3` means `.a == 1 or (.b == 2 and .c == 3)`. See
[and, or, not](https://jqlang.org/manual/v1.8/#and-or-not).
