---
title: Invoking jq
summary: The jq command line and its common flags, reading several JSON values, and NDJSON.
level: 101
---

On the command line, jq takes a program and zero or more files:

```
jq [options] 'program' [file...]
```

With no file it reads standard input, so the usual shapes are `jq '.name' data.json` and
`curl -s https://example.org/api | jq '.items[]'`. Put the program in single quotes: jq
programs are full of characters the shell would otherwise interpret (`|`, `$`, `*`, `"`).

The flags change three things: how the input is read, how the program is run over it, and
how outputs are written. The playground has a switch for each common flag; in the snippets
below the flags in use are listed with the snippet, and the playground's Command tab shows
the full command line. The complete list is in the manual under
[Invoking jq](https://jqlang.org/manual/v1.8/#invoking-jq).

## Summary of the common flags

| Flag | Long form | Effect |
| --- | --- | --- |
| `-n` | `--null-input` | Run the program once with `null` as input; read inputs with `input`/`inputs`. |
| `-s` | `--slurp` | Read every input value into one array and run the program once. |
| `-R` | `--raw-input` | Each input line is a string, not JSON. |
| `-r` | `--raw-output` | Write strings without quotes. |
| `-j` | `--join-output` | Like `-r`, and no newline after each output. |
| `-c` | `--compact-output` | One line per output. |
| `-S` | `--sort-keys` | Write object keys in sorted order. |
| `-a` | `--ascii-output` | Escape every non-ASCII character as `\uXXXX`. |
| | `--tab` | Indent with tabs. |
| | `--indent n` | Indent with n spaces (0 to 7, default 2). |
| | `--arg name value` | Bind `$name` to the string `value`. |
| | `--argjson name json` | Bind `$name` to the parsed JSON value. |
| | `--seq` | Write the RFC 7464 record separator before each output. |
| | `--stream` | Read the input as `[path, leaf]` events. |
| `-e` | `--exit-status` | Set the exit status from the last output. |

## Several JSON values in one input

jq does not require its input to be a single document. It reads a *sequence* of JSON values,
separated by whitespace, and runs the program once per value. The outputs of all the runs
form one output stream.

```jq-try
program: '.n * 2'
input: '{"n": 1} {"n": 2} {"n": 3}'
caption: Three inputs, three runs, three outputs.
expected: [2, 4, 6]
```

This is exactly the shape of NDJSON (newline-delimited JSON, also called JSON Lines), the
format many services log in: one complete JSON object per line. jq reads it without any
flag:

```jq-try
program: 'select(.status >= 500) | .path'
ref: static:access-log
caption: Each log line is its own input; this keeps the server errors.
expected: ["/v1/alerts", "job:refresh-radar", "/v1/alerts"]
```

## -s: slurp every input into one array

Running once per input is fine for filtering, but anything that needs all the values
together (counting, sorting, totals) needs them in one place. `-s` reads every input into
one array and runs the program once over it:

```jq-try
program: 'length'
ref: static:access-log
options: {slurp: true}
caption: With -s the whole log is one array, so length counts the lines.
expected: [16]
```

```jq-try
program: 'map(.n) | add'
input: '{"n": 1} {"n": 2} {"n": 3}'
options: {slurp: true}
caption: Slurping makes a total across inputs possible.
expected: [6]
```

## -n: null input

With `-n` jq does not read an input for the program; `.` is `null`. This is useful when a
program builds its output from nothing, or when it wants to read the inputs itself with
`input` (the next value) and `inputs` (all remaining values).

```jq-try
program: '[range(5)]'
options: {null_input: true}
caption: No input needed; the program makes its own data.
expected: [[0, 1, 2, 3, 4]]
```

```jq-try
program: '[inputs | .n] | add'
input: '{"n": 1} {"n": 2} {"n": 3}'
options: {null_input: true}
caption: With -n, inputs reads the values one by one; an alternative to -s.
expected: [6]
```

`reduce inputs as $x (...)` with `-n` processes a large file one value at a time without
holding it all in memory, which `-s` cannot do. Reduction is covered in a later chapter.

## -r and -j: raw output

By default every output is written as JSON, so strings keep their quotes. `-r` writes a
string output as plain text, which is what you want when the output goes to another command
or a file. Non-string outputs are unaffected.

```jq-try
program: '.store.books[] | select(.inStock == 0) | .title'
ref: static:bookstore
options: {raw_output: true}
caption: The titles of the sold-out books, one per line, without quotes.
expected: ["JSON at Scale", "Data Wrangling Recipes"]
```

`-j` (join output) is `-r` without the newline after each output, so you control the
separators yourself:

```jq-try
program: '.[] | ., "-"'
input: '["a", "b", "c"]'
options: {raw_output: true, join_output: true}
caption: With -j (here with -r too) the command line prints a-b-c- on one line; the outputs are listed separately here.
expected: ["a", "-", "b", "-", "c", "-"]
```

## -c, --tab, --indent and -S: layout

These flags change only how outputs are written, never which values are produced. `-c`
writes each output on one line, which is the right choice for producing NDJSON:

```jq-try
program: '.store.staff[]'
ref: static:bookstore
options: {compact: true}
caption: One staff member per line, as NDJSON.
expected: [{"name": "Ingrid", "role": "owner", "since": 2012}, {"name": "Omar", "role": "clerk", "since": 2020}, {"name": "Lena", "role": "clerk", "since": 2023}]
```

`--tab` indents with tab characters and `--indent n` with n spaces (`--indent 0` is the same
as `-c`):

```jq-try
program: '.store.location'
ref: static:bookstore
options: {indent: 4}
caption: Four spaces per level instead of two.
expected: [{"city": "Oslo", "country": "NO"}]
```

```jq-try
program: '.store.location'
ref: static:bookstore
options: {tab: true}
caption: Tabs instead of spaces.
expected: [{"city": "Oslo", "country": "NO"}]
```

`-S` writes the keys of every object in sorted order, at every depth. It is useful for
diffing two JSON files:

```jq-try
program: '.'
input: '{"b": 2, "a": {"z": 1, "y": 2}}'
options: {sort_keys: true}
caption: The keys come out sorted at every level.
expected: [{"a": {"y": 2, "z": 1}, "b": 2}]
```

## -a: ASCII output

`-a` replaces every non-ASCII character in the output with a `\uXXXX` escape. The value is
the same string; only its spelling in the output changes. Use it when the output passes
through a system that mishandles UTF-8.

```jq-try
program: '.city'
input: '{"city": "Tromsø"}'
options: {ascii_output: true}
caption: On the command line this prints "Tromsø".
expected: ["Tromsø"]
```

## -R: raw input

`-R` reads the input as text instead of JSON. Each line becomes one string input. Combined
with `-s` the whole text is one string; combined with `-n`, `inputs` produces the lines.

```jq-try
program: 'ascii_upcase'
input: "first line\nsecond line"
options: {raw_input: true}
caption: Each line is a string input.
expected: ["FIRST LINE", "SECOND LINE"]
```

```jq-try
program: '[inputs | split(",")]'
input: "name,city\nAstrid,Oslo\nBjorn,Bergen"
options: {raw_input: true, null_input: true}
caption: Reading CSV lines with -R -n and splitting each on commas.
expected: [[["name", "city"], ["Astrid", "Oslo"], ["Bjorn", "Bergen"]]]
```

```jq-try
program: 'length'
input: "one\ntwo\nthree\n"
options: {raw_input: true, slurp: true}
caption: With -R -s the whole text is a single string (14 characters here).
expected: [14]
```

## --arg and --argjson: passing values in

Never build a jq program by pasting shell variables into it; quoting goes wrong and it is a
security problem. Pass values with `--arg` and refer to them as variables:

```jq-try
program: '.store.books[] | select(.author == $author) | .title'
ref: static:bookstore
options: {args: {author: Ada Filter}}
caption: jq --arg author 'Ada Filter' ... binds $author to a string.
expected: ["Learning jq", "Functional Filters"]
```

`--arg` always gives a string. To pass a number, a boolean, an array or an object, use
`--argjson`, which parses its value as JSON:

```jq-try
program: '.store.books[] | select(.price < $max) | .title'
ref: static:bookstore
options: {argjson: {max: 10}}
caption: jq --argjson max 10 ... binds $max to the number 10.
expected: ["Learning jq", "Pipes and Paths"]
```

The difference matters: with `--arg max 10`, `$max` is the string `"10"`, and every number
is less than every string in jq's ordering (see *Conditionals and comparisons*), so the
comparison would be true for every book.

```jq-try
program: '.store.books | map(select(.price < $max)) | length'
ref: static:bookstore
options: {args: {max: '10'}}
caption: 'A common mistake: --arg gives the string "10", so all 8 books pass.'
expected: [8]
```

## --seq: record separators

`--seq` switches jq to JSON text sequences (RFC 7464) in both directions. On output, it
writes the ASCII record separator character (0x1E) before every value, so a consumer can
recover the values even if one of them is truncated. On input, jq then expects each value to
be preceded by that character as well; plain JSON without separators is rejected with a
parse warning. When producing a sequence from ordinary data, the simplest safe form is with
`-n`, which reads no input:

```jq-try
program: '1, [2, 3]'
options: {null_input: true, seq: true}
caption: jq -n --seq writes each value after a 0x1E character. The values are unchanged.
expected: [1, [2, 3]]
```

## --stream: reading as events

`--stream` makes jq parse the input incrementally and feed the program a stream of events
instead of whole values: `[path, leaf]` for every scalar, and a closing `[path]` when an
array or object ends. It lets jq process documents larger than memory. Streaming has its own
chapter later in the guide; here is what the events look like:

```jq-try
program: '.'
input: '{"a": 1, "b": [true, null]}'
options: {stream: true, compact: true}
caption: Every leaf with its path, plus closing events for the array and the object.
expected: [[["a"], 1], [["b", 0], true], [["b", 1], null], [["b", 1]], [["b"]]]
```

## -e: exit status from the output

Normally jq exits with status 0 whenever the program ran without errors. With `-e`, the exit
status also reflects the last output: 1 if it was `false` or `null`, 4 if there was no
output at all, and 0 otherwise. That turns jq into a test in shell scripts:

```
if jq -e '.store.open' bookstore.json > /dev/null; then echo open; fi
```

The playground shows outputs rather than exit statuses, so it cannot demonstrate `-e`
directly, but it can show the value the test would use:

```jq-try
program: 'any(.store.books[]; .inStock == 0)'
ref: static:bookstore
caption: The last output is true, so jq -e would exit with status 0.
expected: [true]
```

## Files, and what jq prints

When several files are given, jq reads them one after another as if they were one input
stream, so `jq '.id' a.json b.json` runs once for every value in both files. Outputs are
written to standard output and errors to standard error, which is why redirecting the output
to a file still shows errors in the terminal. The next chapter, *Values and types*, looks
at the values themselves.
