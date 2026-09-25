# Authoring content

All content lives under `src/playground_jq/` and is validated when the app starts. Every
runnable piece (example, tutorial step solution, guide snippet) is executed by the test suite
and must produce exactly its recorded output.

## The loop

1. Write the content (program, input, explanation), without `expected`.
2. `uv run pjq content fill --only <id-prefix>` runs each new item and records its output as
   `expected` (or as a `digest` when the output is over 3 KB).
3. Review every filled output: it must be what the explanation claims. A program that runs is
   not the same as a program that teaches the right thing. Fix and re-fill with `--overwrite`.
4. `uv run pjq content check --only <id-prefix>` must report every item as `pass`.
5. `uv run pytest -q tests/test_content.py` must pass.

Other commands: `uv run pjq run '<program>' --source static:bookstore` runs a program over a
dataset; `uv run pjq sources list` lists every dataset and snapshot; `uv run pjq sources fetch
dhis2:system-info` prints one.

## Inputs

An input is either a reference to a dataset or snapshot, or inline text:

```yaml
input: {ref: static:bookstore}          # a static dataset (fixtures/static.yaml)
input: {ref: dhis2:data-elements}       # a recorded DHIS2 snapshot (fixtures/dhis2/)
input: {ref: echo:post-json}            # a recorded postman-echo snapshot (fixtures/echo/)
input: {text: '{"a": [1, 2, 3]}'}       # inline; keep it short
```

Several JSON values in one inline text are several inputs, as jq reads them (`text: '1 2 3'`).

## Options

Flags are fields of `options`, matching `jq` flags: `slurp` (-s), `null_input` (-n),
`raw_input` (-R), `raw_output` (-r), `join_output` (-j), `compact` (-c), `sort_keys` (-S),
`tab`, `indent`, `seq`, `stream`, `ascii_output` (-a), `args` (`--arg`, a map of strings),
`argjson` (`--argjson`, a map of JSON values). Programs using `input`, `inputs`, `debug`,
`stderr`, `input_filename`, `halt_error` or `--stream` run on the jq binary automatically.

`$ENV` and `env` are a fixed stand-in environment:
`{"HOME": "/home/learner", "USER": "learner", "SHELL": "/bin/bash", "PAGER": "less", "LANG": "C.UTF-8", "TZ": "UTC"}`.

Avoid `now`, and anything else that changes between runs; the output must be reproducible.

## Checks

Beyond `expected`, an item may set:

- `error: "<substring>"` for an item that demonstrates an error; outputs before the error are
  still compared if `expected` is present.
- `unordered: true` when output order is not meaningful.
- `geojson: true` when the single output must validate as GeoJSON (geojson-pydantic).

## Example groups: `examples/NN-<group>.yaml`

```yaml
id: strings
title: Strings
description: Splitting, joining, trimming and converting text.
order: 30              # listing order; groups from the jq manual start at 900
track: language        # language | dhis2 | echo | patterns | manual
examples:
  - id: strings-split-join          # unique across all examples; start with the group id
    title: Split a string and join it back
    level: 101                      # 101 beginner, 201 intermediate, 301 advanced
    tags: [split, join]
    explanation: |
      Markdown. Say what the program does and why, in two to five sentences.
    program: '.title | split(" ") | join("-")'
    input: {text: '{"title": "learning jq today"}'}
    manual: [https://jqlang.org/manual/v1.8/#split-1]
    guide: [strings]                # guide chapter slugs that cover it
```

## Tutorials: `tutorials/<level>-NN-<slug>.yaml`

Tutorials run over static datasets only (or inline text).

```yaml
id: 101-01-first-steps
level: 101
order: 1
title: First steps with the bookstore
summary: One sentence.
input: {ref: static:bookstore}
guide: [identity-and-fields]
steps:
  - title: The identity filter
    body: |
      Markdown shown before the task.
    task: Output the whole input unchanged.
    hints: [First hint, Second hint]
    solution: .
    starter: ''
    why: |
      Markdown shown after the step is solved.
```

## Guide chapters: `guide/NN-<slug>.md`

Frontmatter, then markdown. A runnable snippet is a fenced block with the info string
`jq-try` whose body is YAML:

````markdown
---
title: Pipes and the comma
summary: One sentence for the table of contents.
level: 101
---

Some prose.

```jq-try
program: '.a, .b'
input: '{"a": 1, "b": 2}'
caption: Two outputs, one per expression.
```
````

Snippet keys: `program`, `input` (inline text) or `ref` (a dataset reference),
`options`, `caption`, `cli_only: true` for command-line-only behaviour, `error`,
`unordered`. `fill` appends the `expected:` line. Snippet ids are `<slug>-<n>`, so
`--only <slug>` selects one chapter.

## Style

- No emojis anywhere.
- Plain, precise English. Explain why, not only what.
- jq 1.8 semantics. Link the manual section: `https://jqlang.org/manual/v1.8/#<anchor>`
  (anchors: see `content/builtins.yaml` `manual:` fields).
