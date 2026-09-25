---
title: Sorting and grouping
summary: Ordering arrays by one or several keys, grouping and counting, removing duplicates, and taking the top N.
level: 201
---

Sorting and grouping turn a pile of records into something you can read: the most expensive
items first, one line per department, how many issues carry each label. jq does all of this
with a handful of builtins that share one idea: a key function. `sort_by(.price)` does not sort
by a field name; it runs the filter `.price` on every element and sorts by what comes out. Any
filter works as a key, which is where most of the power comes from.

All of these builtins take an array as input and return a new array. See the manual on
[`sort` and `sort_by`](https://jqlang.org/manual/v1.8/#sort-sort_by),
[`group_by`](https://jqlang.org/manual/v1.8/#group_by) and
[`unique` and `unique_by`](https://jqlang.org/manual/v1.8/#unique-unique_by).

## sort: the natural order

`sort` puts the elements of an array in jq's natural order. Numbers sort numerically, strings
by Unicode code point, which means uppercase letters come before lowercase ones and "10" comes
before "9" (strings are compared character by character, not as numbers).

```jq-try
program: '(.numbers | sort), (.words | sort)'
input: '{"numbers": [10, 2, 33, 4.5, -1], "words": ["banana", "Cherry", "apple", "10", "9"]}'
caption: 'Numbers in numeric order; strings by code point: digits, then uppercase, then lowercase.'
expected: [[-1, 2, 4.5, 10, 33], ["10", "9", "Cherry", "apple", "banana"]]
```

## How mixed types are ordered

When an array holds values of different types, jq still gives a total order. Types are ranked
first, then values within a type are compared:

| Rank | Type | Compared by |
|------|------|-------------|
| 1 | `null` | (only one value) |
| 2 | `false` | (only one value) |
| 3 | `true` | (only one value) |
| 4 | numbers | numeric value |
| 5 | strings | code point, left to right |
| 6 | arrays | element by element |
| 7 | objects | first their sorted key sets, then values key by key |

This order is used everywhere values are compared: `sort`, `min`, `max`, `unique`, `group_by`
and the `<` operator.

```jq-try
program: 'sort'
input: '[3, "b", null, true, false, [1], {"a": 1}, "a", 1, [0]]'
caption: null, false, true, numbers, strings, arrays, objects.
expected: [[null, false, true, 1, 3, "a", "b", [0], [1], {"a": 1}]]
```

```jq-try
program: 'sort'
input: '[{"b": 0}, {"a": 2, "b": 1}, {"a": 1, "b": 2}]'
caption: 'Objects compare key sets first: ["a","b"] sorts before ["b"]; then values decide.'
expected: [[{"a": 1, "b": 2}, {"a": 2, "b": 1}, {"b": 0}]]
```

## sort_by: sorting by a key

`sort_by(f)` sorts by the output of `f` for each element. The sort is stable: elements with
equal keys keep their original relative order.

```jq-try
program: '.store.books | sort_by(.price) | map("\(.price) \(.title)")'
ref: static:bookstore
caption: Books from cheapest to most expensive. jq 1.8 prints 22.0 as it was written in the input.
expected: [["6.25 Pipes and Paths", "8.5 Learning jq", "14.5 Data Wrangling Recipes", "19.99 Functional Filters", "22.0 Regular Expressions Unleashed", "24.0 JSON at Scale", "27.75 Streams and Generators", "31.9 The Art of the Shell"]]
```

To sort by several keys, give them separated by commas. The first key decides; the second
breaks ties, and so on. Internally `sort_by(a, b)` compares the arrays `[a, b]`.

```jq-try
program: '.employees | sort_by(.dept, .name) | map("\(.dept) \(.name)")'
ref: static:employees
caption: By department, then alphabetically by name within each department.
expected: [["eng Astrid", "eng Bjorn", "eng Chiara", "eng Jonas", "hr Ines", "ops Dmitri", "ops Efua", "sal Farid", "sal Greta", "sal Hiro"]]
```

## Descending order

For numbers, negate the key: `sort_by(-.price)` sorts from high to low, and it combines freely
with other keys. For strings, negation is not possible; sort ascending and `reverse` the result
(that reverses ties too, which usually does not matter).

```jq-try
program: '.employees | sort_by(.dept, -.salary) | map("\(.dept) \(.name) \(.salary)")'
ref: static:employees
caption: Department ascending, salary descending within each department.
expected: [["eng Astrid 150000", "eng Chiara 105000", "eng Bjorn 98000", "eng Jonas 30000", "hr Ines 70000", "ops Dmitri 110000", "ops Efua 95000", "sal Hiro 120000", "sal Greta 76000", "sal Farid 72000"]]
```

```jq-try
program: 'sort_by(-.)'
input: '["b", "a", "c"]'
caption: 'Common mistake: strings cannot be negated.'
error: 'cannot be negated'
```

```jq-try
program: 'sort | reverse'
input: '["b", "a", "c"]'
caption: 'Descending strings: sort, then reverse.'
expected: [["c", "b", "a"]]
```

## Where do nulls go?

`null` is the smallest value, so records with a missing key sort first. Add a boolean key in
front to push them to the end: `false` sorts before `true`, so `sort_by(.x == null, .x)` puts
every record with a value first.

```jq-try
program: 'sort_by(.closed_at) | map(.number)'
input: '[{"number": 1, "closed_at": "2026-02-01"}, {"number": 2, "closed_at": null}, {"number": 3, "closed_at": "2026-01-15"}]'
caption: The open issue (closed_at null) comes first.
expected: [[2, 3, 1]]
```

```jq-try
program: 'sort_by(.closed_at == null, .closed_at) | map(.number)'
input: '[{"number": 1, "closed_at": "2026-02-01"}, {"number": 2, "closed_at": null}, {"number": 3, "closed_at": "2026-01-15"}]'
caption: 'The boolean key sends nulls last; the date sorts the rest.'
expected: [[3, 1, 2]]
```

## group_by: bucketing by a key

`group_by(f)` sorts the array by `f` and splits it into sub-arrays of elements with equal keys.
The result is an array of groups, ordered by key. Each group is a plain array, so `.[0]` gives
a representative element and `length` gives the size. Almost every "per something" report
starts this way.

```jq-try
program: '.employees | group_by(.dept) | map(map(.name))'
ref: static:employees
caption: One array of names per department, in department order (eng, hr, ops, sal).
expected: [[["Astrid", "Bjorn", "Chiara", "Jonas"], ["Ines"], ["Dmitri", "Efua"], ["Farid", "Greta", "Hiro"]]]
```

## Counting with group_by and length

To count occurrences, group and then measure each group. Building an object with
`{key: length}` pairs, or a list of small records, both work; the list keeps a useful order.

```jq-try
program: '.employees | group_by(.dept) | map({dept: .[0].dept, count: length, payroll: add(.[].salary)})'
ref: static:employees
caption: Head count and payroll per department.
expected: [[{"dept": "eng", "count": 4, "payroll": 383000}, {"dept": "hr", "count": 1, "payroll": 70000}, {"dept": "ops", "count": 2, "payroll": 205000}, {"dept": "sal", "count": 3, "payroll": 268000}]]
```

```jq-try
program: '[.[].labels[].name] | group_by(.) | map({label: .[0], count: length}) | sort_by(-.count, .label)'
ref: static:github-issues
caption: How often each label is used, most frequent first, ties alphabetical.
expected: [[{"label": "bug", "count": 4}, {"label": "docs", "count": 3}, {"label": "dependencies", "count": 2}, {"label": "priority: high", "count": 2}, {"label": "enhancement", "count": 1}, {"label": "good first issue", "count": 1}, {"label": "needs repro", "count": 1}, {"label": "windows", "count": 1}]]
```

```jq-try
program: 'group_by(.state) | map({(.[0].state): length}) | add'
ref: static:github-issues
caption: A count object, built by merging one small object per group.
expected: [{"closed": 4, "open": 6}]
```

## unique and unique_by

`unique` sorts the array and removes duplicates. `unique_by(f)` keeps one element for each
distinct key: the first element of each group that `group_by(f)` would produce. Both return
sorted output, so do not expect the original order to survive.

```jq-try
program: '[.employees[].skills[]] | unique'
ref: static:employees
caption: Every skill once, sorted.
expected: [["bash", "go", "jq", "kubernetes", "leadership", "negotiation", "python", "recruiting", "rust", "spanish", "terraform"]]
```

```jq-try
program: '.employees | unique_by(.dept) | map({dept, name})'
ref: static:employees
caption: The first employee listed in each department.
expected: [[{"dept": "eng", "name": "Astrid"}, {"dept": "hr", "name": "Ines"}, {"dept": "ops", "name": "Dmitri"}, {"dept": "sal", "name": "Farid"}]]
```

```jq-try
program: 'map(.customer.name) | unique | length'
ref: static:orders
caption: How many distinct customers placed orders.
expected: [5]
```

## Top N

Combine a descending sort with a slice to take the top N. `.[:3]` keeps the first three
elements; it is safe on shorter arrays.

```jq-try
program: '.employees | sort_by(-.salary) | .[:3] | map({name, salary})'
ref: static:employees
caption: The three highest salaries.
expected: [[{"name": "Astrid", "salary": 150000}, {"name": "Hiro", "salary": 120000}, {"name": "Dmitri", "salary": 110000}]]
```

```jq-try
program: 'sort_by(-.comments) | .[:3] | map("#\(.number) \(.comments) comments")'
ref: static:github-issues
caption: The three most discussed issues.
expected: [["#107 11 comments", "#101 7 comments", "#110 6 comments"]]
```

The top N per group follows the same pattern inside the `map` of a `group_by`:

```jq-try
program: '.employees | group_by(.dept) | map({dept: .[0].dept, top: (sort_by(-.salary) | .[0].name)})'
ref: static:employees
caption: The best-paid person in each department.
expected: [[{"dept": "eng", "top": "Astrid"}, {"dept": "hr", "top": "Ines"}, {"dept": "ops", "top": "Dmitri"}, {"dept": "sal", "top": "Hiro"}]]
```
