---
title: Reduce and foreach
summary: Folding a stream into one value with reduce, emitting running state with foreach, and when add or group_by are the better choice.
level: 201
---

Most jq filters work on one value at a time. `reduce` and `foreach` are how a program carries
state from one value to the next: a running total, a count, an object being built up key by key.
If you know `fold` or `reduce` from other languages, this is the same idea, written with jq's
generator syntax.

## reduce

[`reduce`](https://jqlang.org/manual/v1.8/#reduce) has this shape:

```
reduce SOURCE as $x (INIT; UPDATE)
```

jq evaluates `INIT` once to get the starting state. Then, for each output of `SOURCE`, it binds
the output to `$x` and runs `UPDATE` with the current state as `.`; the result becomes the new
state. After the last output, the state is the result. Inside `UPDATE`, `.` is the state, not the
original input, which is the most common source of confusion.

```jq-try
program: 'reduce .[] as $x (0; . + $x)'
input: '[1, 2, 3, 4]'
caption: 'A sum: the state starts at 0 and $x is added each time.'
expected: [10]
```

```jq-try
program: 'reduce .[] as $x (0; . + 1)'
input: '[5, 6, 7]'
caption: A count; the values themselves are not used.
expected: [3]
```

```jq-try
program: 'reduce .[] as $x (0; if $x > . then $x else . end)'
input: '[3, 9, 2]'
caption: A maximum, keeping the larger of the state and each value.
expected: [9]
```

If `SOURCE` produces nothing, the result is `INIT` unchanged.

```jq-try
program: 'reduce empty as $x (0; . + 1), reduce .[] as $x ("start"; . + $x)'
input: '[]'
caption: No outputs, no updates.
expected: [0, "start"]
```

## Building objects

The state can be any value. Starting from `{}` and assigning a key per step builds an object,
which is how you count, total or index by a key in one pass. `+=` is handy here, because
`null + x` is `x`: a key that does not exist yet simply starts from its first value.

```jq-try
program: 'reduce .[] as $o ({}; .[$o.customer.name] += ($o.items | map(.qty * .price) | add))'
ref: static:orders
caption: Spending per customer (cancelled orders included).
expected: [{"Ada Lovelace": 48.5, "Grace Hopper": 76.4, "Linus T": 65.75, "Margaret H": 59.97, "Ken Thompson": 27.75}]
```

```jq-try
program: 'reduce .employees[] as $e ({}; .[$e.dept] += [$e.name])'
ref: static:employees
caption: Names collected per department, in the order they appear.
expected: [{"eng": ["Astrid", "Bjorn", "Chiara", "Jonas"], "ops": ["Dmitri", "Efua"], "sal": ["Farid", "Greta", "Hiro"], "hr": ["Ines"]}]
```

```jq-try
program: 'reduce .[] as $x ({}; .[$x] += 1)'
input: '["bug", "docs", "bug", "bug", "question"]'
caption: Counting occurrences of each string.
expected: [{"bug": 3, "docs": 1, "question": 1}]
```

## Indexing by a key

A lookup table turns later searches into a direct `.[key]` access. Object keys must be strings,
so numeric ids go through `tostring`.

```jq-try
program: 'reduce .[] as $i ({}; .[$i.number | tostring] = {title, state}) | .["107"]'
ref: static:github-issues
caption: 'Common mistake: inside UPDATE, . is the state, so {title, state} reads from the object being built.'
expected: [{"title": null, "state": null}]
```

```jq-try
program: 'reduce .[] as $i ({}; .[$i.number | tostring] = ($i | {title, state})) | .["107"]'
ref: static:github-issues
caption: 'Fixed: take the fields from $i, not from the state.'
expected: [{"title": "Segfault with deeply nested arrays", "state": "open"}]
```

jq has a builtin for this exact pattern, `INDEX(source; key)`, which is defined with `reduce`.

```jq-try
program: 'INDEX(.employees[]; .id) | .["8"] | {name, title}'
ref: static:employees
caption: Employee 8 looked up in the index.
expected: [{"name": "Hiro", "title": "Head of Sales"}]
```

## Destructuring in reduce

The `as` in `reduce` accepts the same patterns as a normal variable binding (chapter 17), which
keeps the update short when the items are pairs or records.

```jq-try
program: 'reduce .[] as [$k, $v] ({}; .[$k] = $v)'
input: '[["host", "db.internal"], ["port", 5432]]'
caption: Pairs turned into an object.
expected: [{"host": "db.internal", "port": 5432}]
```

```jq-try
program: 'reduce .employees[] as {dept: $d, salary: $s} ({}; .[$d] += $s)'
ref: static:employees
caption: Payroll per department, with the two fields bound directly.
expected: [{"eng": 383000, "ops": 205000, "sal": 268000, "hr": 70000}]
```

## foreach

[`foreach`](https://jqlang.org/manual/v1.8/#foreach) works like `reduce`, but outputs the state
after every step instead of only at the end. That gives running totals, cumulative counts, and
any computation where each output depends on what came before.

```jq-try
program: '[foreach .[] as $x (0; . + $x)]'
input: '[1, 2, 3, 4]'
caption: A running sum; the last element equals the reduce result.
expected: [[1, 3, 6, 10]]
```

```jq-try
program: '[foreach .[] as $o (0; . + ($o.items | map(.qty * .price) | add); {id: $o.id, running: .})]'
ref: static:orders
caption: The three-argument form shapes each output; here the running revenue per order.
expected: [[{"id": "A-1001", "running": 26}, {"id": "A-1002", "running": 57.9}, {"id": "A-1003", "running": 80.4}, {"id": "A-1004", "running": 115.15}, {"id": "A-1005", "running": 175.12}, {"id": "A-1006", "running": 219.62}, {"id": "A-1007", "running": 247.37}, {"id": "A-1008", "running": 278.37}]]
```

With a third argument, `foreach SOURCE as $x (INIT; UPDATE; EXTRACT)` runs `EXTRACT` after each
update, with the new state as `.` and `$x` still bound. `EXTRACT` can output nothing (with
`empty` or `select`), which makes it a filter over the stream as well.

```jq-try
program: '[foreach .[] as $x (0; . + 1; select(. % 2 == 0) | $x)]'
input: '["a", "b", "c", "d", "e"]'
caption: Every second element, using the state as a counter.
expected: [["b", "d"]]
```

```jq-try
program: '[foreach .[] as $x ({}; .[$x] += 1; "\($x) #\(.[$x])")]'
input: '["bug", "docs", "bug", "bug"]'
caption: Numbering repeated values as they occur.
expected: [["bug #1", "docs #1", "bug #2", "bug #3"]]
```

```jq-try
program: '[foreach .[] as $line ({buf: [], out: null}; if $line == "" then {buf: [], out: .buf} else {buf: (.buf + [$line]), out: null} end; .out | select(.))]'
input: '["a", "b", "", "c", ""]'
caption: 'Grouping lines into blocks separated by empty lines: the state holds the block in progress.'
expected: [[["a", "b"], ["c"]]]
```

Because `foreach` produces outputs one by one, it combines with `limit` and `first` and stops
early.

```jq-try
program: '[limit(4; foreach range(1; 1000000) as $i (0; . + $i))]'
input: 'null'
caption: Only four steps of a million are ever computed.
expected: [[1, 3, 6, 10]]
```

## How UPDATE's outputs are used

`UPDATE` is a filter, and a filter may produce several outputs or none. In `reduce`, jq 1.8 keeps
the last output as the new state, and if there is none, the state becomes `null`. In `foreach`,
each output of `UPDATE` is passed to `EXTRACT`, and the last one carries on as the state for the
next step. Most programs never rely on this, but
an `empty` or a `select` that removes everything inside `UPDATE` can silently wipe the state.

```jq-try
program: 'reduce .[] as $x (100; select($x > 1) | . + $x)'
input: '[1, 2, 3]'
caption: 'Common mistake: select in UPDATE wiped the starting 100 at the first step; null + 2 + 3 gives 5.'
expected: [5]
```

```jq-try
program: 'reduce (.[] | select(. > 1)) as $x (100; . + $x)'
input: '[1, 2, 3]'
caption: Filter in SOURCE instead, so UPDATE always produces exactly one state.
expected: [105]
```

## reduce versus add and group_by

`reduce` can express almost any aggregation, but the specialised builtins are shorter and say
what they mean. Prefer them when they fit:

| Task | With builtins | With reduce |
|------|---------------|-------------|
| sum | `add` or `add(.[].x)` | `reduce .[] as $v (0; . + $v)` |
| count per key | `group_by(.k) \| map({(.[0].k): length}) \| add` | `reduce .[] as $v ({}; .[$v.k] += 1)` |
| index by key | `INDEX(.[]; .id)` | `reduce .[] as $v ({}; .[$v.id \| tostring] = $v)` |

The two programs below compute the same totals. Note the difference in key order: `group_by`
sorts by key, while `reduce` keeps the order in which keys first appear.

```jq-try
program: 'reduce (.[].items[]) as $it ({}; .[$it.sku] += $it.qty)'
ref: static:orders
caption: Units sold per SKU, in order of first appearance.
expected: [{"BOOK-1": 3, "MUG-7": 6, "BOOK-4": 1, "STK-3": 12, "BOOK-2": 1, "BOOK-3": 1, "BOOK-5": 3, "BOOK-8": 1, "BOOK-7": 1}]
```

```jq-try
program: '[.[].items[]] | group_by(.sku) | map({(.[0].sku): (map(.qty) | add)}) | add'
ref: static:orders
caption: The same totals via group_by, with the keys sorted.
expected: [{"BOOK-1": 3, "BOOK-2": 1, "BOOK-3": 1, "BOOK-4": 1, "BOOK-5": 3, "BOOK-7": 1, "BOOK-8": 1, "MUG-7": 6, "STK-3": 12}]
```

## Performance notes

- `reduce` and `foreach` run in one pass and hold only the state, so they suit large inputs,
  especially with `inputs` and `-n`, where the whole stream never has to be in memory at once.
- `group_by` and `sort_by` build and sort a full array first. On big inputs, a `reduce` into an
  object by key avoids the sort.
- To collect values into an array, `[SOURCE]` is shorter and faster than
  `reduce SOURCE as $x ([]; . + [$x])`. Use `reduce` when each step needs the state.
- Keep work that does not depend on the state out of `UPDATE`. Compute constants once with
  `as $name` before the `reduce`, not on every step.
