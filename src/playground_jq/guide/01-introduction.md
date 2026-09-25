---
title: Introduction
summary: What jq is, how a filter turns one input into a stream of outputs, and how to use this playground and guide.
level: 101
---

jq is a small programming language for JSON. You give it a JSON document and a
*program*, and it prints what the program makes of the document. It is most often used on
the command line, between a tool that produces JSON (`curl`, `kubectl`, `aws`, a log file)
and whatever comes next, but the language itself is complete: it has variables, functions,
recursion, reductions and error handling.

This guide teaches the language from the ground up, using jq 1.8. Every example in it can
be run, changed and opened in the playground.

## Programs are filters

The central idea in jq is the *filter*. A filter takes one input value and produces zero,
one or many output values. The simplest filter is `.`, the identity, which produces its
input unchanged.

```jq-try
program: '.'
input: '{"name": "jq", "version": "1.8"}'
caption: The identity filter outputs its input unchanged.
expected: [{"name": "jq", "version": "1.8"}]
```

Most filters pick something out of their input. `.name` produces the value of the `name`
key:

```jq-try
program: '.name'
input: '{"name": "jq", "version": "1.8"}'
caption: A field access produces one value from the object.
expected: ["jq"]
```

Filters are combined into larger filters. The pipe `|` feeds every output of the left
filter into the right one, just like a Unix pipe:

```jq-try
program: '.store.location | .city'
ref: static:bookstore
caption: Go into the store's location, then take the city.
expected: ["Oslo"]
```

## A program produces a stream

A jq program does not return *a* value. It produces a *stream* of values, which may be
empty, or hold one value, or many. This is the single most important thing to understand
about jq, and most of the surprises in the language come from forgetting it.

The comma operator runs two filters on the same input and produces the outputs of both:

```jq-try
program: '.name, .version'
input: '{"name": "jq", "version": "1.8"}'
caption: Two filters joined by a comma give two outputs.
expected: ["jq", "1.8"]
```

`.[]` produces every element of an array, one output each:

```jq-try
program: '.[]'
input: '[1, 2, 3]'
caption: Three outputs, not one array.
expected: [1, 2, 3]
```

And `empty` produces no output at all:

```jq-try
program: 'empty'
input: '{"name": "jq"}'
caption: A program can also produce nothing.
expected: []
```

When the stream is several values, the command-line `jq` prints them one after another,
each on its own line (or lines). The playground shows them as a list of separate outputs.
If you want one array instead, wrap the program in brackets, which collects the stream:

```jq-try
program: '[.[] | . * 10]'
input: '[1, 2, 3]'
caption: Square brackets collect a stream into one array.
expected: [[10, 20, 30]]
```

## Several inputs

jq also reads a stream of *inputs*. If the input text holds several JSON values, one after
another, the program runs once for each of them:

```jq-try
program: '.a'
input: '{"a": 1} {"a": 2} {"a": 3}'
caption: Three input values, so the program runs three times.
expected: [1, 2, 3]
```

This is how jq handles log files with one JSON object per line. The next chapter,
*Invoking jq*, shows how to change this with flags such as `-s` (slurp) and `-n` (null
input).

## A realistic first program

Here is a program you will understand completely by the end of chapter 10. It goes through
the bookstore's books, keeps those cheaper than 10, and builds a small object for each:

```jq-try
program: '.store.books[] | select(.price < 10) | {title, price}'
ref: static:bookstore
caption: The two books under 10, as new objects.
expected: [{"title": "Learning jq", "price": 8.5}, {"title": "Pipes and Paths", "price": 6.25}]
```

Read it from left to right: `.store.books[]` produces each of the eight books; `select`
lets through only the ones that match; `{title, price}` builds a new object from each
survivor.

## How the playground works

The playground has four parts:

| Part | What it holds |
| --- | --- |
| Input | The JSON text jq reads. Load a dataset, or type or paste your own. Several values in a row are several inputs. |
| Program | The jq filter. It runs as you type; for very large inputs, press Run or Cmd/Ctrl+Enter. |
| Output | Each output value, in order, or the error jq reported. |
| Flags | The command-line options, such as raw output (`-r`) or slurp (`-s`). |

The Command tab next to the output shows the equivalent command line, such as
`jq -c '.store.books[0]' input.json`, so what you learn here carries straight over to a
terminal. Flags change what jq reads or how it prints:

```jq-try
program: '.store.books[0].title'
ref: static:bookstore
options: {raw_output: true}
caption: With -r (raw output) a string is printed without its quotes.
expected: ["Learning jq"]
```

When something goes wrong, jq reports an error instead of (or after) the outputs. Errors are
part of the language, and this guide shows the common ones on purpose:

```jq-try
program: '.name.first'
input: '{"name": "jq"}'
error: 'Cannot index string with'
caption: A common mistake. You cannot take a field of a string.
```

## How to read this guide

The chapters build on each other:

- Chapters 1 to 10 (level 101) cover the core: values, paths, pipes, construction,
  operators, conditionals, and `select` and `map`.
- Later chapters (201 and 301) cover variables, reduction, paths and assignment, functions,
  regular expressions, streaming and larger patterns.

Every snippet in the guide has been run, and its recorded output is checked on every build,
so what you see is what jq 1.8 produces. Each snippet shows its input, its program and its
output together. Change it and run it again, or open it in the playground to experiment.
Where a section covers a part of the language in depth, it links to the relevant part of
the [jq 1.8 manual](https://jqlang.org/manual/v1.8/).

A good habit from the start: when a result surprises you, remove the end of the program
back to the last pipe, look at what that part produces, and add the pieces back one at a
time. Because a jq program is a chain of filters, it can always be inspected this way.

```jq-try
program: '.store.books[] | .tags'
ref: static:bookstore
caption: Inspecting an intermediate step. Each book's tags are a separate output.
expected: [["jq", "cli", "beginner"], ["json", "data"], ["jq", "unix"], ["unix", "cli"], ["jq", "functional", "advanced"], ["data", "recipes"], ["regex"], ["jq", "advanced"]]
```
