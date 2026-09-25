---
title: SQL-style operators and joins
summary: Thinking in tables with jq - lookups with INDEX, membership with IN, joins between two arrays with JOIN, anti-joins, and grouped aggregation.
level: 301
---

A lot of JSON is really tables: a list of records with the same fields, often with ids that
point into another list. The employees dataset is a typical example, with an `employees`
array whose `dept` field refers to the `id` of an entry in `departments`. Questions about such
data sound like SQL: *join* the two lists, *group by* department, *where* the salary is above
a threshold, *count* per group.

jq has no query planner, but it has a handful of builtins, described under
[SQL-Style Operators](https://jqlang.org/manual/v1.8/#sql-style-operators), that make these
operations short. This chapter shows how each SQL idea maps onto jq.

| SQL | jq |
| --- | --- |
| `SELECT a, b` | `map({a, b})` |
| `WHERE cond` | `map(select(cond))` |
| `ORDER BY a, b DESC` | `sort_by(.a, -.b)` (numbers) |
| `LIMIT n` | `.[:n]` or `limit(n; .[])` |
| `DISTINCT` | `unique`, `unique_by(f)` |
| `GROUP BY` + aggregate | `group_by(f) \| map({...})` |
| `IN (...)` | `IN(...)` |
| primary-key lookup | `INDEX(f)` and `$index[key]` |
| `JOIN` | `JOIN($index; stream; key; combine)` or a lookup in `map` |

## SELECT, WHERE, ORDER BY, LIMIT

The basic query shape needs no special operators at all:

```jq-try
program: '.employees | map(select(.salary > 90000)) | sort_by(.dept, -.salary) | map({name, dept, salary}) | .[:4]'
ref: static:employees
caption: 'Salaries above 90000, by department and then highest salary first; the first four rows.'
expected: [[{"name": "Astrid", "dept": "eng", "salary": 150000}, {"name": "Chiara", "dept": "eng", "salary": 105000}, {"name": "Bjorn", "dept": "eng", "salary": 98000}, {"name": "Dmitri", "dept": "ops", "salary": 110000}]]
```

## Membership with IN

[`IN(values)`](https://jqlang.org/manual/v1.8/#in) is true when the input equals any of the
values produced by its argument. It replaces chains of `or`:

```jq-try
program: '[.employees[] | select(.dept | IN("ops", "hr")) | .name]'
ref: static:employees
caption: 'The same as select(.dept == "ops" or .dept == "hr").'
expected: [["Dmitri", "Efua", "Ines"]]
```

The two-argument form `IN(source; values)` asks whether *any* value of `source` is among
`values`. Applied to an array field, it tests for overlap:

```jq-try
program: '[.employees[] | select(IN(.skills[]; "jq", "rust")) | .name]'
ref: static:employees
caption: Everyone who knows jq or rust.
expected: [["Astrid", "Bjorn", "Chiara", "Dmitri"]]
```

The argument is a stream, not an array. To test against a list you have as an array, expand
it with `[]`:

```jq-try
program: '["go", "jq"] as $wanted | [.employees[] | select(.skills[0] | IN($wanted[])) | .name]'
ref: static:employees
caption: Employees whose first listed skill is in the wanted list.
expected: [["Astrid"]]
```

For "contains all of" rather than "contains any of", jq has
[`inside`](https://jqlang.org/manual/v1.8/#inside) and `contains`. `A | inside(B)` is true
when every element of `A` also appears in `B`:

```jq-try
program: '[.employees[] | select(["go", "jq"] | inside($e.skills)) | .name]'
ref: static:employees
error: $e is not defined
caption: 'Common mistake: inside the select, . is the employee; there is no $e unless you bind it.'
```

```jq-try
program: '[.employees[] | . as $e | select(["go", "jq"] | inside($e.skills)) | .name]'
ref: static:employees
caption: 'Bind the row first, then ask whether ["go", "jq"] is inside its skills. Only Astrid has both.'
expected: [["Astrid"]]
```

## Lookups with INDEX

[`INDEX(stream; key)`](https://jqlang.org/manual/v1.8/#sql-style-operators) builds an object
from a stream of records, keyed by `key`. The one-argument form `INDEX(key)` indexes the
elements of an input array. Looking up a record is then a constant-time field access instead
of a scan:

```jq-try
program: 'INDEX(.departments[]; .id)'
ref: static:employees
caption: Departments keyed by their id.
expected: [{"eng": {"id": "eng", "name": "Engineering", "floor": 3}, "ops": {"id": "ops", "name": "Operations", "floor": 1}, "sal": {"id": "sal", "name": "Sales", "floor": 2}, "hr": {"id": "hr", "name": "People", "floor": 2}}]
```

Object keys are always strings, so INDEX converts every key with `tostring`. Numeric ids
therefore have to be converted when you look them up. The employees' `manager` field holds a
numeric employee id:

```jq-try
program: '(.employees | INDEX(.id)) as $by_id | .employees[] | select(.manager) | {name, manager: $by_id[.manager].name}'
ref: static:employees
error: Cannot index object with number
caption: 'Common mistake: $by_id has string keys, so a number cannot be used to look up in it.'
```

```jq-try
program: '(.employees | INDEX(.id)) as $by_id | [.employees[] | {name, manager: $by_id[.manager | tostring].name}] | .[0:6]'
ref: static:employees
caption: 'A self-join: each employee with the name of their manager. A null manager becomes "null", which is not a key, so the lookup gives null.'
expected: [[{"name": "Astrid", "manager": null}, {"name": "Bjorn", "manager": "Astrid"}, {"name": "Chiara", "manager": "Astrid"}, {"name": "Dmitri", "manager": null}, {"name": "Efua", "manager": "Dmitri"}, {"name": "Farid", "manager": "Hiro"}]]
```

## Joins

The most readable join in jq is usually a lookup inside `map`: index the smaller table once,
then enrich each row of the larger one.

```jq-try
program: 'INDEX(.departments[]; .id) as $dept | .employees | map({name, department: $dept[.dept].name, floor: $dept[.dept].floor}) | .[0:4]'
ref: static:employees
caption: Each employee with the name and floor of their department.
expected: [[{"name": "Astrid", "department": "Engineering", "floor": 3}, {"name": "Bjorn", "department": "Engineering", "floor": 3}, {"name": "Chiara", "department": "Engineering", "floor": 3}, {"name": "Dmitri", "department": "Operations", "floor": 1}]]
```

jq 1.8 also has builtin `JOIN` functions. `JOIN($index; stream; key)` outputs, for each row of
`stream`, the pair `[row, $index[row | key]]`; `JOIN($index; stream; key; combine)` passes each
pair through `combine` instead:

```jq-try
program: '[JOIN(INDEX(.departments[]; .id); .employees[]; .dept; {name: .[0].name, department: .[1].name})] | .[0:3]'
ref: static:employees
caption: The four-argument form; .[0] is the employee, .[1] the matching department.
expected: [[{"name": "Astrid", "department": "Engineering"}, {"name": "Bjorn", "department": "Engineering"}, {"name": "Chiara", "department": "Engineering"}]]
```

`JOIN($index; key)`, with two arguments, joins the elements of the input array and returns an
array of pairs. A tempting `combine` is `add`, which merges the two objects. Be careful: on
fields both sides have, the right side wins.

```jq-try
program: 'INDEX(.departments[]; .id) as $d | .employees | JOIN($d; .dept) | map(add) | .[0] | {id, name, title}'
ref: static:employees
caption: 'Merged with add, the department''s id and name overwrote the employee''s: Astrid became "Engineering".'
expected: [{"id": "eng", "name": "Engineering", "title": "CTO"}]
```

Rename one side before merging, or build the combined object field by field as above.

### Outer joins and anti-joins

When a key has no match, the lookup gives `null`, so `JOIN` and the `map` lookup are *left
outer joins*: every row of the stream is kept. Filter on the right side for an inner join, or
on its absence for an anti-join:

```jq-try
program: 'INDEX(.[1][]; .id) as $known | .[0] | {inner: map(select($known[.dept])) | map(.name), anti: map(select($known[.dept] | not)) | map(.name)}'
input: '[[{"name": "a", "dept": "x"}, {"name": "b", "dept": "y"}, {"name": "c", "dept": "z"}], [{"id": "x"}, {"id": "z"}]]'
caption: 'Rows with a matching department, and rows without one.'
expected: [{"inner": ["a", "c"], "anti": ["b"]}]
```

The anti-join in the other direction answers questions like "which departments have hired
nobody since 2022":

```jq-try
program: '[.employees[] | select(.hired >= "2022") | .dept] as $recent | [.departments[] | select(.id | IN($recent[]) | not) | .name]'
ref: static:employees
caption: 'ISO dates compare correctly as strings. Engineering, Sales and People hired recently; Operations did not.'
expected: [["Operations"]]
```

## GROUP BY and aggregation

[`group_by(f)`](https://jqlang.org/manual/v1.8/#group_by) sorts an array by `f` and splits it
into arrays of equal `f`. Everything a SQL aggregate does happens in the `map` that follows,
with `.[0]` supplying the group key:

```jq-try
program: '.employees | group_by(.dept) | map({dept: .[0].dept, n: length, avg: (map(.salary) | add / length | round), top: (max_by(.salary).name)})'
ref: static:employees
caption: Count, average and the highest earner per department.
expected: [[{"dept": "eng", "n": 4, "avg": 95750, "top": "Astrid"}, {"dept": "hr", "n": 1, "avg": 70000, "top": "Ines"}, {"dept": "ops", "n": 2, "avg": 102500, "top": "Dmitri"}, {"dept": "sal", "n": 3, "avg": 89333, "top": "Hiro"}]]
```

`HAVING` is a `select` on the groups:

```jq-try
program: '.employees | group_by(.title) | map(select(length > 1) | {title: .[0].title, people: map(.name)})'
ref: static:employees
caption: Titles held by more than one person.
expected: [[{"title": "Account Executive", "people": ["Farid", "Greta"]}, {"title": "Engineer", "people": ["Bjorn", "Chiara"]}]]
```

For counting, `reduce` into an object is shorter and does not need to sort:

```jq-try
program: 'reduce .employees[] as $e ({}; .[$e.dept] += 1)'
ref: static:employees
caption: 'null + 1 is 1, so the first employee of each department starts the count.'
expected: [{"eng": 4, "ops": 2, "sal": 3, "hr": 1}]
```

Many-to-many relations, such as employees and their skills, are "unnested" with `.[]`, just
as SQL would join through a link table:

```jq-try
program: '[.employees[] | {name, skill: .skills[]}] | group_by(.skill) | map({skill: .[0].skill, people: map(.name)}) | map(select(.people | length > 1))'
ref: static:employees
caption: One row per employee and skill, grouped by skill; skills shared by at least two people.
expected: [[{"skill": "bash", "people": ["Dmitri", "Efua"]}, {"skill": "go", "people": ["Astrid", "Chiara"]}, {"skill": "jq", "people": ["Astrid", "Bjorn", "Dmitri"]}, {"skill": "leadership", "people": ["Astrid", "Hiro"]}, {"skill": "negotiation", "people": ["Farid", "Greta"]}]]
```

Grouping and joining combine naturally. Payroll per department, with the department name from
the other table:

```jq-try
program: 'INDEX(.departments[]; .id) as $d | .employees | group_by(.dept) | map({department: $d[.[0].dept].name, payroll: (map(.salary) | add)}) | sort_by(-.payroll)'
ref: static:employees
caption: The join happens after grouping, once per group rather than once per employee.
expected: [[{"department": "Engineering", "payroll": 383000}, {"department": "Sales", "payroll": 268000}, {"department": "Operations", "payroll": 205000}, {"department": "People", "payroll": 70000}]]
```

## Performance notes

`group_by` sorts, which costs O(n log n) per call; a `select` inside `map` that scans another
array costs O(n * m). For small documents neither matters. For thousands of rows, build an
`INDEX` once, bind it to a variable, and do lookups; avoid calling `group_by` or scanning the
second array inside a loop over the first.
