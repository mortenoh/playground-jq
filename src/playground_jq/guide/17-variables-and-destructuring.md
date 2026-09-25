---
title: Variables and destructuring
summary: Binding values with `as`, variable scope, destructuring arrays and objects, the ?// alternative, and values passed in from outside.
level: 201
---

A jq pipeline passes one value along: each filter only sees what the previous one produced.
That is usually what you want, but sometimes a value from earlier is needed later, after `.` has
moved on to something else. Variables solve this. `expr as $name | body` runs `expr`, binds each
of its outputs to `$name`, and runs `body` with the same input `.` that `expr` had. The manual
calls this the [variable binding operator](https://jqlang.org/manual/v1.8/#variable-binding-operator).

## Binding with as

The simplest use saves the current input under a name before descending into it.

```jq-try
program: '. as $x | [1, 2] | map(. + $x)'
input: '10'
caption: 'Inside map, . is each element; $x still holds the original 10.'
expected: [[11, 12]]
```

```jq-try
program: '.employees as $emps | .departments | map(.id as $d | {name, headcount: ($emps | map(select(.dept == $d)) | length)})'
ref: static:employees
caption: 'A join: for each department, count the employees that point to it.'
expected: [[{"name": "Engineering", "headcount": 4}, {"name": "Operations", "headcount": 2}, {"name": "Sales", "headcount": 3}, {"name": "People", "headcount": 1}]]
```

A classic case is comparing each element with a value computed from the whole input, such as an
average.

```jq-try
program: '(.store.books | map(.price) | add / length) as $avg | [.store.books[] | select(.price < $avg) | .title]'
ref: static:bookstore
caption: Books cheaper than the average price, computed once and reused.
expected: [["Learning jq", "Pipes and Paths", "Data Wrangling Recipes"]]
```

Note that `as` does not change `.`: the body starts with the same input as the expression before
`as`. And when the expression produces several outputs, the body runs once for each.

```jq-try
program: '.[] as $n | {n: $n, doubled: ($n * 2)}'
input: '[1, 2, 3]'
caption: One body run per output of .[].
expected: [{"n": 1, "doubled": 2}, {"n": 2, "doubled": 4}, {"n": 3, "doubled": 6}]
```

## Scope

A variable is visible from its `as` to the end of the pipeline it starts, and no further. Inside
parentheses, that means the closing parenthesis ends it. Using a variable outside its scope is a
compile error. An inner binding of the same name shadows the outer one.

```jq-try
program: '(1 as $x | $x), $x'
input: 'null'
caption: 'Common mistake: $x only exists inside the parentheses.'
error: '$x is not defined'
```

```jq-try
program: '1 as $x | [$x, (2 as $x | $x), $x]'
input: 'null'
caption: The inner $x shadows the outer one only inside its parentheses.
expected: [[1, 2, 1]]
```

## $__loc__

`$__loc__` is a special variable that holds the file and line where it appears, as an object.
It is mostly useful in error messages from your own functions, so you can tell which call
failed.

```jq-try
program: |
  def check:
    if . < 0 then error("negative value, line \($__loc__.line)") else . end;
  .[] | check
input: '[1, -1]'
caption: The error message reports line 2 of the program.
expected: [1]
error: 'negative value, line 2'
```

```jq-try
program: '$__loc__'
input: 'null'
caption: 'The whole value: the file is <top-level> for a program given directly.'
expected: [{"file": "<top-level>", "line": 1}]
```

## Destructuring arrays

Instead of a single `$name`, the left side of `as` can be a pattern that mirrors the shape of the
value. `. as [$a, $b]` binds the first two elements. Missing elements bind to `null`, and extra
elements are ignored.

```jq-try
program: '. as [$first, $second] | {$first, $second}'
input: '["gold", "silver", "bronze"]'
caption: '{$first} is short for {first: $first}.'
expected: [{"first": "gold", "second": "silver"}]
```

```jq-try
program: '.[] as [$name, $score] | "\($name): \($score)"'
input: '[["Astrid", 41], ["Bjorn"]]'
caption: 'The second pair has no score, so $score is null.'
expected: ["Astrid: 41", "Bjorn: null"]
```

## Destructuring objects

Object patterns name the keys to pick: `{a: $x}` binds the value of key `a` to `$x`, and `{$a}`
is short for `{a: $a}`. Keys with spaces or computed keys use quotes or parentheses. Patterns
nest, so one `as` can reach deep into a value.

```jq-try
program: '. as {a: $a, b: [$first]} | [$a, $first]'
input: '{"a": 1, "b": [2, 3]}'
caption: An object pattern with an array pattern inside it.
expected: [[1, 2]]
```

```jq-try
program: '.[] as {username: $u, name: {first: $f}, roles: [$role]} | "\($u) (\($f)): \($role)"'
ref: static:users
caption: 'Three fields from each user, one of them nested. Ken has no roles, so $role is null.'
expected: ["ada (Ada): admin", "grace (Grace): editor", "linus (Linus): viewer", "margaret (Margaret): admin", "ken (Ken): null", "barbara (Barbara): editor"]
```

```jq-try
program: '. as {"full name": $n, ("ag" + "e"): $a} | [$n, $a]'
input: '{"full name": "Ada Lovelace", "age": 36}'
caption: A quoted key and a computed key.
expected: [["Ada Lovelace", 36]]
```

## The destructuring alternative ?//

Real data is not always uniform: a field may hold a single value in some records and an array in
others. The [destructuring alternative operator](https://jqlang.org/manual/v1.8/#destructuring-alternative-operator)
`?//` lets you list several patterns. jq tries them left to right and uses the first that binds
without an error. Every variable in any of the patterns exists in the body; those not bound by
the matching pattern are `null`.

```jq-try
program: '.[] as [$a] ?// $a | $a'
input: '[[1], 2, [3]]'
caption: Unwrap one-element arrays, take plain values as they are.
expected: [1, 2, 3]
```

```jq-try
program: '[.[] as [$a, $b] ?// {a: $a, b: $b} | {$a, $b}]'
input: '[[1, 2], {"a": 3, "b": 4}]'
caption: Pairs as arrays or as objects, normalised to one shape.
expected: [[{"a": 1, "b": 2}, {"a": 3, "b": 4}]]
```

Only an error moves on to the next pattern. A missing object key is not an error, so an object
pattern happily binds `null`.

```jq-try
program: '.[] as {a: $x} ?// {b: $x} | $x'
input: '[{"a": 1}, {"b": 2}]'
caption: 'Common mistake: {a: $x} matches {"b": 2} too, with $x null. The second pattern is never tried.'
expected: [1, null]
```

An error raised in the body also moves on to the next pattern, as long as there is one left.
When the last pattern fails, its error is reported.

```jq-try
program: '.[] as [$a] ?// $a | if $a == 3 then error("try the next pattern") else $a end'
input: '[[3], [4]]'
caption: 'For [3], the body fails with $a = 3, so jq retries with the whole array as $a.'
expected: [[3], 4]
```

```jq-try
program: '.[] as [$a] ?// {$a} | $a'
input: '[[1], {"a": 2}, "x"]'
caption: 'The string fits neither pattern; the error of the last pattern stops the program.'
expected: [1, 2]
error: 'Cannot index string'
```

## Values from outside: --arg and --argjson

On the command line, `--arg name value` defines `$name` as a string and `--argjson name json`
defines it as a parsed JSON value. In the playground they are set as options. The difference
matters: `--arg` always gives a string, even for `5`.

```jq-try
program: '[.store.books[] | select(.author == $author) | .title]'
ref: static:bookstore
options: {args: {author: "Ada Filter"}}
caption: 'jq --arg author "Ada Filter" ...: a parameter instead of a hard-coded string.'
expected: [["Learning jq", "Functional Filters"]]
```

```jq-try
program: '{arg: $a, argjson: $b, arg_type: ($a | type), argjson_type: ($b | type)}'
input: 'null'
options: {args: {a: "5"}, argjson: {b: 5}}
caption: '--arg gives the string "5"; --argjson gives the number 5.'
expected: [{"arg": "5", "argjson": 5, "arg_type": "string", "argjson_type": "number"}]
```

```jq-try
program: '.store.books | map(select(.price <= $max)) | length'
ref: static:bookstore
options: {args: {max: "20"}}
caption: 'Common mistake: $max is the string "20", and every number is less than any string.'
expected: [8]
```

```jq-try
program: '.store.books | map(select(.price <= $max)) | length'
ref: static:bookstore
options: {argjson: {max: 20}}
caption: With --argjson the comparison is numeric (or write $max | tonumber).
expected: [4]
```

Referring to a variable that was never defined is a compile error, not `null`.

```jq-try
program: '$missing'
input: 'null'
caption: 'Common mistake: undefined variables are errors.'
error: '$missing is not defined'
```

## The environment: $ENV and env

[`$ENV` and `env`](https://jqlang.org/manual/v1.8/#$env-env) give the process environment as an
object. In the playground this is a fixed stand-in environment so that results are reproducible:
`HOME`, `USER`, `SHELL`, `PAGER`, `LANG` and `TZ`. On your machine you will see your real
variables.

```jq-try
program: '$ENV.USER, env.HOME, ($ENV | keys)'
input: 'null'
caption: A single variable, another, and every name in the stand-in environment.
expected: ["learner", "/home/learner", ["HOME", "LANG", "PAGER", "SHELL", "TZ", "USER"]]
```

```jq-try
program: '$ENV.EDITOR // $ENV.PAGER // "vi"'
input: 'null'
caption: A fallback chain; EDITOR is not set here, PAGER is.
expected: ["less"]
```
