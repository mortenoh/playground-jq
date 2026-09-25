# playground-jq

[![CI](https://github.com/mortenoh/playground-jq/actions/workflows/ci.yaml/badge.svg)](https://github.com/mortenoh/playground-jq/actions/workflows/ci.yaml)
[![Pages](https://github.com/mortenoh/playground-jq/actions/workflows/pages.yaml/badge.svg)](https://mortenoh.github.io/playground-jq/)
[![Try it](https://img.shields.io/badge/try%20it-in%20your%20browser-c28a17)](https://mortenoh.github.io/playground-jq/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Python 3.13](https://img.shields.io/badge/python-3.13-3776ab)](https://www.python.org/)
[![jq 1.8](https://img.shields.io/badge/jq-1.8.2-5a5a5a)](https://jqlang.org/)
[![uv](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/uv/main/assets/badge/v0.json)](https://github.com/astral-sh/uv)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)

A place to learn [jq](https://jqlang.org/) properly: an interactive playground, a complete
language guide, tutorials in three levels (101, 201, 301), and a large library of examples.
Every example, tutorial solution and guide snippet is executed by the test suite, so what
you read is what jq actually does.

Try it: https://mortenoh.github.io/playground-jq/ (runs entirely in your browser)

## What is in it

- **Playground**: a Monaco editor with jq syntax highlighting, builtin completion and hover
  docs, compile errors marked in place, plain-language hints for common errors, every jq flag
  (`-n -s -R -r -j -c -S --tab --indent --seq --stream --arg --argjson`), the equivalent
  command line, share links, and a map preview when the output is GeoJSON.
- **Inputs**: static datasets (bookstore, GitHub issues, orders, Kubernetes pods, AWS EC2,
  NDJSON logs, CSV, GeoJSON, ...), [postman-echo](https://postman-echo.com/) requests, and the
  [DHIS2](https://dhis2.org/) demo database through [dhis2w](https://pypi.org/project/dhis2w-client/)
  (profile `play43`), live or from recorded snapshots. DHIS2 serves a lot of GeoJSON.
- **Guide**: the whole jq language, chapter by chapter, with runnable snippets.
- **Tutorials**: jq 101 (beginner), 201 (intermediate), 301 (advanced), each a set of guided
  steps over a static dataset, checked against the expected output.
- **Examples**: hand-written groups for the language, DHIS2 (metadata, data, GeoJSON),
  postman-echo and real-world patterns, plus every runnable example from the jq manual.
- **Reference**: every jq 1.8 builtin with the manual's description.

## How it runs

The backend is FastAPI + pydantic. jq runs through the [jq.py](https://pypi.org/project/jq/)
library in a separate process that is killed on timeout (jq holds the GIL and cannot be
interrupted). Programs that need the jq command line (`input`, `inputs`, `debug`, `--stream`,
...) run on the `jq` binary instead. The frontend is React + Vite + Tailwind (shadcn), served by
the same process.

The same frontend also builds as a static site (GitHub Pages): jq 1.8.2 runs in the browser as
WebAssembly ([jq-wasm](https://github.com/owenthereal/jq-wasm)) in a Web Worker, and every API
answer is a JSON file exported at build time, so the playground, guide, tutorials and examples all
work without a server. Only live DHIS2 and postman-echo requests need the backend.

## Running it

Requirements: [uv](https://docs.astral.sh/uv/), [bun](https://bun.sh/), and jq 1.8 on `PATH`.
DHIS2 access uses a dhis2w profile named `play43` (`~/.config/dhis2/profiles.toml`); without it,
DHIS2 inputs come from the recorded snapshots.

```shell
make dev        # refresh everything, then serve on http://127.0.0.1:8765 with reload
make refresh    # wipe every build artifact and dependency, then rebuild
make check      # the CI gate: format, lint, types, tests, every content item verified
make test       # backend and frontend unit tests
make e2e        # every example, tutorial and snippet through the UI, backend and static builds
make live       # verify live-source examples against postman-echo and DHIS2
```

For frontend work, run `cd frontend && bun run dev` beside `make dev`; vite proxies the API.

The CLI (`uv run pjq --help`):

```shell
pjq run '.store.books[] | .title' --source static:bookstore -r
pjq sources list
pjq sources record            # refresh the postman-echo and DHIS2 snapshots
pjq content check             # run and verify every example, tutorial and snippet
pjq content fill --only <id>  # record expected outputs for new content (review them!)
```

See [docs/authoring.md](docs/authoring.md) for how content is written and verified.

## License

GNU Affero General Public License v3.0 ([LICENSE](LICENSE)), the same as
[chap-core](https://github.com/dhis2-chap/chap-core). The builtin reference and the jq manual examples are derived from
the jq manual (CC BY 3.0); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
