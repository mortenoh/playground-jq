# Architecture

## Running a program

`POST /api/run` takes a program, an input text (or a source to fetch it from) and the flags.

- **jq.py, in a runner process.** jq.py holds the GIL for as long as a program runs and cannot be
  interrupted, so programs run in a pooled child process (`jq/jq_runner.py`) spoken to over
  pipes, one JSON request and reply per line. When the time limit is reached, the process is
  killed; that is the only way to stop a jq program.
- **The jq binary, for command-line features.** jq.py evaluates each input value on its own, so
  `input`/`inputs` never see the next value, and it has no `--stream`, `input_filename`, or
  place for `debug`/`stderr` to write. Programs that use them run on the `jq` binary, in a
  subprocess with a timeout. The engine chooses automatically; the UI can force either.
- **A stand-in environment.** `$ENV` and `env` are a fixed, fake environment in both engines,
  so the server's own environment never leaks into a program's output.
- **Output like the command line.** Outputs are formatted the way `jq` prints them for the
  chosen flags, and every result carries the equivalent `jq` command.
- **Errors located.** Compile errors come back with line and column, which the editor marks.

## Inputs

| Source | What it is |
| --- | --- |
| `static` | Hand-written datasets in `fixtures/static/`, described by `fixtures/static.yaml` |
| `echo` | [postman-echo](https://postman-echo.com/), which answers with the request it received |
| `dhis2` | The DHIS2 demo database through dhis2w (profile `play43`), GET only |

Live sources have presets, each with a recorded snapshot in `fixtures/<source>/`
(`pjq sources record`), so everything works offline and the tests are deterministic. Every preset
also has a suggested program (`content/starters.yaml`), verified like any example.

## Content and verification

Examples (`examples/`), tutorials (`tutorials/`), guide chapters (`guide/`) and starters are
validated by pydantic when the app starts. `content/verify.py` runs every runnable item over its
input and compares the outputs with the recorded ones (or with a SHA-256 digest for large
outputs); GeoJSON outputs are also validated with geojson-pydantic. The test suite runs all of it
offline; `make live` runs the live-source items against the real services, where values may
drift but the shape must not.

## Frontend

React 19, Vite, Tailwind v4 and shadcn (Base UI), following dirigent's frontend. Monaco is loaded
lazily with a jq grammar, completion and hover from the builtin catalogue. The built bundle is
copied into the Python package and served by the same FastAPI process.

## The static build

`scripts/build_pages.sh` builds the same frontend for GitHub Pages. jq 1.8.2 runs in the browser
through [jq-wasm](https://github.com/owenthereal/jq-wasm), in a Web Worker that is terminated on
timeout, with the same stand-in `$ENV`, error locations and equivalent command as the server.
`scripts/export_static.py` calls every API route through the test client and writes the answers
as JSON files, so the static app reads exactly what the server would answer. Live DHIS2 and
postman-echo are the only things it cannot do.

The browser suite (`make e2e`) runs every example, tutorial solution and guide snippet through
the UI in both builds and compares the outputs with the backend's own run.
