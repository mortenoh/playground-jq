"""Import the jq 1.8 manual: its runnable examples as example groups, its entries as the builtin catalogue.

The jq manual is licensed CC BY 3.0 (see THIRD_PARTY_NOTICES.md). Run from the repository
root with `uv run python scripts/import_manual.py`; the output is committed, so this only
runs again when moving to a new jq version.
"""

import html
import json
import re
import subprocess
import urllib.request
from pathlib import Path
from typing import Any

import yaml

TAG = "jq-1.8.1"
MANUAL_YML = f"https://raw.githubusercontent.com/jqlang/jq/{TAG}/docs/content/manual/v1.8/manual.yml"
MANUAL_HTML = "https://jqlang.org/manual/v1.8/"
MANUAL_BASE = "https://jqlang.org/manual/v1.8/"
ATTRIBUTION = f"jq 1.8 manual ({MANUAL_BASE}), CC BY 3.0"

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "src" / "playground_jq"
EXAMPLES = PACKAGE / "examples"
BUILTINS = PACKAGE / "content" / "builtins.yaml"
ANCHORS = PACKAGE / "content" / "manual-anchors.txt"

#: Manual sections whose entries document builtins, functions and operators.
BUILTIN_SECTIONS = {
    "Builtin operators and functions",
    "Conditionals and Comparisons",
    "Regular expressions",
    "Advanced features",
    "Math",
    "I/O",
    "Streaming",
    "Assignment",
}

#: A name as it appears at the start of a signature.
NAME = re.compile(r"^(\$__loc__|\$ENV|\$__prog_args|@[a-z0-9]+|[a-z_][a-z0-9_]*)")

#: Builtins the manual documents in an entry's prose rather than its title: the anchor of that
#: entry and the builtin's forms.
DATES = "dates"
DOCUMENTED_ELSEWHERE: dict[str, tuple[str, list[str]]] = {
    "//": ("alternative-operator", ["a // b"]),
    "IN": ("sql-style-operators", ["IN(s)", "IN(source; s)"]),
    "INDEX": ("sql-style-operators", ["INDEX(idx_expr)", "INDEX(stream; idx_expr)"]),
    "JOIN": (
        "sql-style-operators",
        ["JOIN($idx; idx_expr)", "JOIN($idx; stream; idx_expr)", "JOIN($idx; stream; idx_expr; join_expr)"],
    ),
    "tojson": ("convert-to-from-json", ["tojson"]),
    "fromjson": ("convert-to-from-json", ["fromjson"]),
    "fromdate": (DATES, ["fromdate"]),
    "todate": (DATES, ["todate"]),
    "fromdateiso8601": (DATES, ["fromdateiso8601"]),
    "todateiso8601": (DATES, ["todateiso8601"]),
    "now": (DATES, ["now"]),
    "mktime": (DATES, ["mktime"]),
    "gmtime": (DATES, ["gmtime"]),
    "localtime": (DATES, ["localtime"]),
    "strptime": (DATES, ["strptime(fmt)"]),
    "strftime": (DATES, ["strftime(fmt)"]),
    "strflocaltime": (DATES, ["strflocaltime(fmt)"]),
    "format": ("format-strings-and-escaping", ['format("csv")', 'format("json")', "format(name)"]),
    "erf": ("math", ["erf"]),
    "erfc": ("math", ["erfc"]),
    "jn": ("math", ["jn(n; x)"]),
    "yn": ("math", ["yn(n; x)"]),
    "modulemeta": ("modulemeta", ["modulemeta"]),
    "get_search_list": ("modules", ["get_search_list"]),
    "get_prog_origin": ("modules", ["get_prog_origin"]),
    "get_jq_origin": ("modules", ["get_jq_origin"]),
}

#: What the C math library functions do, since the manual lists them only by name.
MATH_SUMMARIES = {
    1: "One-input C math function: applies to the input number.",
    2: "Two-input C math function: takes both arguments as parameters and ignores the input.",
    3: "Three-input C math function: takes all arguments as parameters and ignores the input.",
}


def fetch(url: str) -> str:
    """Download a text document."""
    with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310 - fixed https URLs
        return response.read().decode()


def slug(text: str) -> str:
    """A file-name slug."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def plain(text: str) -> str:
    """Markdown title text without backticks."""
    return text.replace("`", "").strip()


def first_sentence(body: str) -> str:
    """The first sentence of an entry body, flattened to one line."""
    flat = " ".join(body.split())
    match = re.match(r"(.+?[.!?])(\s|$)", flat)
    sentence = match.group(1) if match else flat
    return sentence[:240]


def main() -> None:
    """Download the manual and write the example groups and the builtin catalogue."""
    manual = yaml.safe_load(fetch(MANUAL_YML))
    page = fetch(MANUAL_HTML)
    anchors = [html.unescape(anchor) for anchor in re.findall(r'<section[^>]* id="([^"]*)"', page)]
    every_id = sorted({html.unescape(anchor) for anchor in re.findall(r' id="([^"]*)"', page)})
    ANCHORS.write_text(
        "# Every anchor in the jq 1.8 manual page; content links are checked against it.\n" + "\n".join(every_id) + "\n"
    )
    titles: list[str] = []
    for section in manual["sections"]:
        titles.append(section["title"])
        titles.extend(entry["title"] for entry in section.get("entries") or [])
    if len(titles) != len(anchors):
        raise SystemExit(f"{len(titles)} manual titles but {len(anchors)} anchors")
    anchor_of = iter(anchors)

    builtins: dict[str, dict[str, Any]] = {}
    entry_of: dict[str, dict[str, Any]] = {}
    section_of: dict[str, str] = {}
    order = 900
    for section in manual["sections"]:
        section_anchor = next(anchor_of)
        examples: list[dict[str, Any]] = []
        for index, entry in enumerate(section.get("entries") or [], start=1):
            anchor = next(anchor_of)
            entry_of[anchor] = entry
            section_of[anchor] = section["title"]
            key = slug(anchor) or f"{slug(section['title'])}-{index}"
            link = MANUAL_BASE + "#" + anchor
            for number, example in enumerate(entry.get("examples") or [], start=1):
                examples.append(
                    {
                        "id": f"manual-{key}-{number}",
                        "title": plain(entry["title"]) + (f" ({number})" if len(entry["examples"]) > 1 else ""),
                        "level": 201 if section["title"] in {"Advanced features", "Streaming", "Assignment"} else 101,
                        "tags": ["manual"],
                        "program": example["program"],
                        "input": {"text": example["input"]},
                        "expected": [json.loads(output) for output in example["output"]],
                        "manual": [link],
                        "attribution": ATTRIBUTION,
                    }
                )
            if entry["title"].startswith("Format strings"):
                # The formats are listed in the entry's body, one `* `@name`:` item each.
                for match in re.finditer(r"\* `(@[a-z0-9]+)`:\s*\n\s*\n((?:  .*\n?)+)", entry.get("body") or ""):
                    name, text = match.group(1), " ".join(match.group(2).split())
                    builtins[name] = {
                        "name": name,
                        "signatures": [name, f'{name} "...\\(.x)..."'],
                        "summary": first_sentence(text),
                        "section": section["title"],
                        "body": text,
                        "manual": link,
                    }
            if section["title"] in BUILTIN_SECTIONS:
                forms = re.findall(r"`([^`]+)`", entry["title"])
                for form in forms:
                    match = NAME.match(form)
                    if match is None:
                        continue
                    name = match.group(1)
                    record = builtins.setdefault(
                        name,
                        {
                            "name": name,
                            "signatures": [],
                            "summary": first_sentence(entry.get("body") or ""),
                            "section": section["title"],
                            "body": (entry.get("body") or "").strip(),
                            "manual": link,
                        },
                    )
                    if form not in record["signatures"]:
                        record["signatures"].append(form)
        if examples:
            group = {
                "id": f"manual-{slug(section['title'])}",
                "title": f"jq manual: {section['title']}",
                "description": f"Every runnable example from the '{section['title']}' section of the jq 1.8 manual. "
                f"Source: {MANUAL_BASE}#{section_anchor} ({ATTRIBUTION}).",
                "order": order,
                "track": "manual",
                "examples": examples,
            }
            order += 1
            path = EXAMPLES / f"{order}-manual-{slug(section['title'])}.yaml"
            path.write_text(yaml.safe_dump(group, sort_keys=False, allow_unicode=True, width=120))
            print(f"wrote {path.relative_to(ROOT)}: {len(examples)} examples")

    for name, (anchor, signatures) in DOCUMENTED_ELSEWHERE.items():
        entry = entry_of.get(anchor)
        body = (entry.get("body") or "").strip() if entry else ""
        # An entry that documents several builtins as `* NAME(...)`: bullets gives each its own text.
        bullet = re.search(rf"\* `?{re.escape(name)}\([^\n]*\n\s*\n((?:  .*\n?)+)", body)
        summary = first_sentence(" ".join(bullet.group(1).split())) if bullet else first_sentence(body)
        if not body and anchor == "math":
            summary = "C math library function available as a jq builtin."
        if not body and anchor == "modules":
            summary = "Module system introspection."
        builtins[name] = {
            "name": name,
            "signatures": signatures,
            "summary": summary,
            "section": section_of.get(anchor, {"math": "Math", "modules": "Modules"}.get(anchor, "Other")),
            "body": body,
            "manual": MANUAL_BASE + "#" + anchor,
        }

    listed = subprocess.run(["jq", "-rn", "builtins[]"], capture_output=True, text=True, check=True).stdout.split()
    math_anchor = MANUAL_BASE + "#math"
    for item in sorted(listed):
        name, _, arity_text = item.rpartition("/")
        arity = int(arity_text)
        if name.startswith("_") or name in builtins:
            continue
        params = ["a", "b", "c"][:arity] if arity else []
        signature = f"{name}({'; '.join(params)})" if params else name
        builtins[name] = {
            "name": name,
            "signatures": [signature],
            "summary": MATH_SUMMARIES.get(max(arity, 1), "") if _is_math(name) else f"Builtin `{signature}`.",
            "section": "Math" if _is_math(name) else "Other",
            "body": "",
            "manual": math_anchor if _is_math(name) else MANUAL_BASE,
        }
    catalogue = sorted(builtins.values(), key=lambda record: record["name"].lstrip("$@"))
    BUILTINS.write_text(
        "# Generated by scripts/import_manual.py from the "
        + ATTRIBUTION
        + ".\n"
        + yaml.safe_dump(catalogue, sort_keys=False, allow_unicode=True, width=120)
    )
    print(f"wrote {BUILTINS.relative_to(ROOT)}: {len(catalogue)} builtins")


#: The C math library functions jq exposes.
_MATH = set(
    [
        "acos",
        "acosh",
        "asin",
        "asinh",
        "atan",
        "atanh",
        "cbrt",
        "ceil",
        "cos",
        "cosh",
        "exp",
        "exp10",
        "exp2",
        "expm1",
        "fabs",
        "floor",
        "gamma",
        "j0",
        "j1",
        "lgamma",
        "log",
        "log10",
        "log1p",
        "log2",
        "logb",
        "nearbyint",
        "pow10",
        "rint",
        "round",
        "significand",
        "sin",
        "sinh",
        "sqrt",
        "tan",
        "tanh",
        "tgamma",
        "trunc",
        "y0",
        "y1",
        "atan2",
        "copysign",
        "drem",
        "fdim",
        "fmax",
        "fmin",
        "fmod",
        "frexp",
        "hypot",
        "ldexp",
        "modf",
        "nextafter",
        "nexttoward",
        "pow",
        "remainder",
        "scalb",
        "scalbln",
        "fma",
        "lgamma_r",
        "ilogb",
    ]
)


def _is_math(name: str) -> bool:
    return name in _MATH


if __name__ == "__main__":
    main()
