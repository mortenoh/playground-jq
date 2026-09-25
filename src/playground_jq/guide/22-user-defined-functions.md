---
title: User-defined functions
summary: Naming filters with def, the difference between filter and value arguments, recursion, scope, and building a small library of helpers.
level: 301
---

Every builtin you have used so far, `map`, `select`, `to_entries`, `walk`, is itself a jq
function, and most of them are written in jq. You can write your own with `def`. A function
is a named filter: it takes an input, produces zero or more outputs, and can be used anywhere
a filter can.

The manual section is [Defining functions](https://jqlang.org/manual/v1.8/#defining-functions).

## Defining and calling

`def name: body;` defines a function; the definition is followed by the expression that uses
it. The body runs with whatever input the call site has.

```jq-try
program: |
  def celsius_to_f: . * 9 / 5 + 32 | . * 10 | round / 10;
  [.readings[] | .celsius | numbers | celsius_to_f]
ref: static:sensor-readings
caption: 'numbers drops the null and the string reading; each remaining value goes through the function, rounded to one decimal.'
expected: [[88.2, 86.7, 92.8, 94.8, 96.1, 97, 90.9]]
```

A function can produce several outputs, or none, just like any filter:

```jq-try
program: |
  def neighbours: . - 1, . + 1;
  [.[] | neighbours]
input: '[10, 20]'
caption: One input, two outputs per call.
expected: [[9, 11, 19, 21]]
```

## Filter arguments

Arguments are separated by semicolons. A plain argument like `f` in `def apply(f)` is a
*filter*, not a value: the function receives the expression unevaluated, and every time the
body mentions `f`, it runs it against the input it has *at that point*. This is how `map(f)`
and `select(f)` work.

```jq-try
program: |
  def addvalue(f): . + [f];
  map(addvalue(.[0]))
input: '[[1, 2], [10, 20]]'
caption: 'f is .[0], evaluated inside the function, where . is each inner array.'
expected: [[[1, 2, 1], [10, 20, 10]]]
```

Because a filter argument is re-run each time it is used, a generator passed as an argument
multiplies:

```jq-try
program: |
  def twice(f): [f, f];
  twice(1, 2)
input: 'null'
caption: 'Each use of f produces both 1 and 2.'
expected: [[1, 2, 1, 2]]
```

## Value arguments with `$`

Writing the parameter as `$name` evaluates the argument *once, at the call site*, with the
caller's input, and binds each result to a variable. `def f($a): ...` is shorthand for
`def f(a): a as $a | ...`. The same `addvalue` behaves differently with a value argument:

```jq-try
program: |
  def addvalue($v): map(. + $v);
  addvalue(.[0])
input: '[[1, 2], [10, 20]]'
caption: '.[0] is evaluated once against the whole input, giving [1, 2], which is appended to every element.'
expected: [[[1, 2, 1, 2], [10, 20, 1, 2]]]
```

If the argument produces several values, the function runs once per value, and with several
value arguments you get every combination:

```jq-try
program: |
  def pair($a; $b): [$a, $b];
  [pair(1, 2; "x", "y")]
input: 'null'
caption: Two values times two values give four calls.
expected: [[[1, "x"], [1, "y"], [2, "x"], [2, "y"]]]
```

| Parameter | Evaluated | Input of the argument | Typical use |
| --- | --- | --- | --- |
| `f` | every time the body uses it | the value at that point in the body | a transformation or condition: `map(f)`, `select(f)` |
| `$v` | once per call, before the body | the caller's input | a constant: a threshold, a key name, a separator |

A `$v` parameter is also available as a filter named `v`, so `def f($x): $x | x;` is legal
and rarely useful.

## Recursion

A function may call itself. Each call gets its own input, so recursion is a natural fit for
nested data and for mathematical definitions.

```jq-try
program: |
  def fib: if . < 2 then . else (. - 1 | fib) + (. - 2 | fib) end;
  [range(10) | fib]
input: 'null'
caption: The first ten Fibonacci numbers. This version is exponential; fine for small inputs.
expected: [[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]]
```

Value arguments carry state through the recursion, the way loop variables do in other
languages:

```jq-try
program: |
  def gcd($a; $b): if $b == 0 then $a else gcd($b; $a % $b) end;
  [gcd(48; 18), gcd(17; 5)]
input: 'null'
caption: Euclid's algorithm, one call per step.
expected: [[6, 1]]
```

Recursion over the structure of a document measures or rebuilds it. Here the depth of the
configuration: an object or array is one level deeper than its deepest child, a scalar is 0.

```jq-try
program: |
  def depth: if type == "object" or type == "array" then 1 + ([.[] | depth] | max // 0) else 0 end;
  depth, (.logging | depth)
ref: static:config
caption: 'The deepest path is logging.outputs[1].rotate.max_mb: five containers deep.'
expected: [5, 4]
```

For walking every value of a tree, the builtins `recurse`, `..`, `paths` and `walk` are
usually shorter than a hand-written recursion; see the next chapter.

## Scope and closures

Function definitions are lexically scoped. A function can see the functions and variables
defined *before* it (and itself, for recursion), and definitions made inside a body are local
to that body.

```jq-try
program: |
  def area: def square: . * .; square * 3.14;
  [1, 2] | map(area)
input: 'null'
caption: square exists only inside area.
expected: [[3.14, 12.56]]
```

Variables work the same way. A function remembers the variables that were visible where it
was *defined*, not where it is called. A filter argument, likewise, remembers the variables
visible where it was *written*:

```jq-try
program: |
  1 as $x | def show: $x; 2 as $x | [show, $x]
input: 'null'
caption: show sees the $x from its definition (1), even though a later $x is 2.
expected: [[1, 2]]
```

```jq-try
program: |
  def f(g): 10 as $x | g;
  1 as $x | f($x)
input: 'null'
caption: 'The argument $x belongs to the caller, so the $x inside f does not capture it.'
expected: [1]
```

A function must be defined before it is used. Calling one that is defined later is a
compile error:

```jq-try
program: 'def f: g; def g: 1; f'
input: 'null'
error: g/0 is not defined
caption: 'Common mistake: definitions are not hoisted. Define g first.'
```

## Arity: `f/0`, `f/1`, `f/2`

A function is identified by its name *and* its number of arguments, written `name/arity`.
`round/0` and a new `round/1` are different functions, so you can add a variant without
losing the original:

```jq-try
program: |
  def round($digits): pow(10; $digits) as $m | . * $m | round / $m;
  [.[] | [round, round(1), round(2)]]
input: '[3.14159, 2.71828]'
caption: 'Inside round/1, the bare round still means the builtin round/0.'
expected: [[[3, 3.1, 3.14], [3, 2.7, 2.72]]]
```

Calling a name with an arity that does not exist is a compile error, even if other arities
of the same name are defined:

```jq-try
program: 'def scale(f): f * 2; 5 | scale'
input: 'null'
error: scale/0 is not defined
caption: 'Common mistake: scale/1 exists, scale/0 does not.'
```

## Shadowing builtins

A definition with the same name and arity as a builtin replaces it for the rest of the
program. This is occasionally useful to patch behaviour, and a frequent source of confusion
when it happens by accident:

```jq-try
program: |
  def keys: keys_unsorted;
  {"zebra": 1, "apple": 2} | keys
input: 'null'
caption: 'After the definition, keys keeps insertion order instead of sorting.'
expected: [["zebra", "apple"]]
```

Inside a body, a name refers to the function being defined (that is how recursion works), so
`def length: ... length ...;` would call itself, not the builtin. Delegate to a differently
named builtin, as above, or give your function a new name.

## A small library of helpers

Programs that grow past a few lines benefit from naming their steps. The definitions go at
the top, and the last line reads almost like a description of the result:

```jq-try
program: |
  def sum_by(f): map(f) | add;
  def count_by(f): group_by(f) | map({key: (.[0] | f | tostring), value: length}) | from_entries;
  def pct($part; $whole): ($part / $whole * 1000 | round) / 10;
  .employees
  | (sum_by(.salary)) as $total
  | {people: count_by(.dept),
     payroll: $total,
     eng_share: pct(map(select(.dept == "eng")) | sum_by(.salary); $total)}
ref: static:employees
caption: Three helpers, one filter argument each where the function needs to look inside elements.
expected: [{"people": {"eng": 4, "hr": 1, "ops": 2, "sal": 3}, "payroll": 926000, "eng_share": 41.4}]
```

String helpers are good candidates too. A `slug` function turns titles into URL fragments:

```jq-try
program: |
  def slug: ascii_downcase | gsub("[^a-z0-9]+"; "-") | trimstr("-");
  [.store.books[0:4][] | .title | slug]
ref: static:bookstore
caption: Lower-case, replace every run of other characters with one dash, trim dashes at the ends.
expected: [["learning-jq", "json-at-scale", "pipes-and-paths", "the-art-of-the-shell"]]
```

On the command line, definitions like these can live in a file and be loaded with
`include` or `import` and the `-L` search path; in the playground, put them at the top of
the program.
