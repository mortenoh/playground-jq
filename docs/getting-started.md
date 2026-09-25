# Getting started

## Requirements

- [uv](https://docs.astral.sh/uv/) for Python 3.13 and the backend
- [bun](https://bun.sh/) for the frontend
- jq 1.8 on `PATH`, for the programs that need the command line (`input`, `inputs`, `debug`,
  `--stream`)
- Optional: a [dhis2w](https://pypi.org/project/dhis2w-client/) profile named `play43` in
  `~/.config/dhis2/profiles.toml` for live DHIS2 inputs. Without it, DHIS2 inputs come from the
  recorded snapshots.

## Make targets

| Target | What it does |
| --- | --- |
| `make dev` | Refresh everything, then serve on `http://127.0.0.1:8765` with reload |
| `make refresh` | Wipe every build artifact, cache and dependency, then rebuild |
| `make install` | Install dependencies and build the UI into the package |
| `make lint` | Format and auto-fix backend and frontend |
| `make check` | The CI gate: formatting, lint, types, all tests, every content item verified |
| `make test` | Backend and frontend unit tests |
| `make e2e` | Every example, tutorial and snippet through the UI, in the backend and static builds |
| `make live` | Verify live-source examples against postman-echo and DHIS2 |

## The command line

`uv run pjq --help` lists everything. The most useful commands:

```shell
pjq run '.store.books[] | .title' --source static:bookstore -r   # run like the playground
pjq sources list                                                 # datasets and snapshots
pjq sources fetch dhis2:system-info                              # print one input
pjq sources record                                               # refresh live snapshots
pjq content check                                                # verify all content
pjq content check --live                                         # against live sources
pjq examples list --group strings
```

On a terminal these print tables; piped, they write NDJSON with a `kind` on every record.

## Settings

Environment variables with the `PLAYGROUND_JQ_` prefix (or a `.env` file):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PLAYGROUND_JQ_PORT` | `8765` | Port |
| `PLAYGROUND_JQ_JQ_TIMEOUT_SECONDS` | `2.0` | Time limit per run |
| `PLAYGROUND_JQ_DHIS2_PROFILE` | `play43` | dhis2w profile for live DHIS2 |
| `PLAYGROUND_JQ_DHIS2_ENABLED` | `true` | Allow live DHIS2 requests |
| `PLAYGROUND_JQ_ECHO_BASE_URL` | `https://postman-echo.com` | postman-echo |
| `PLAYGROUND_JQ_SOURCE_CACHE_SECONDS` | `300` | Cache for live responses |
