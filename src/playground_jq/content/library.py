"""Loading every example, tutorial, guide chapter and builtin, validated at startup."""

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, TypeAdapter

from playground_jq.content.models import (
    Builtin,
    Chapter,
    ChapterSummary,
    Example,
    ExampleGroup,
    InputSpec,
    Snippet,
    Starter,
    Tutorial,
)

PACKAGE_DIR = Path(__file__).resolve().parent.parent
EXAMPLES_DIR = PACKAGE_DIR / "examples"
TUTORIALS_DIR = PACKAGE_DIR / "tutorials"
GUIDE_DIR = PACKAGE_DIR / "guide"
BUILTINS_FILE = PACKAGE_DIR / "content" / "builtins.yaml"
STARTERS_FILE = PACKAGE_DIR / "content" / "starters.yaml"

#: A runnable snippet in a chapter: a fenced block whose body is YAML.
SNIPPET_BLOCK = re.compile(r"^```jq-try[ \t]*\n(?P<body>.*?)^```[ \t]*$", re.MULTILINE | re.DOTALL)

#: Frontmatter at the top of a chapter.
FRONTMATTER = re.compile(r"\A---\n(?P<meta>.*?)\n---\n", re.DOTALL)


class ContentError(ValueError):
    """Content that does not load: the file and what is wrong."""


class Library(BaseModel):
    """Everything a learner reads and runs."""

    groups: list[ExampleGroup]
    tutorials: list[Tutorial]
    chapters: list[Chapter]
    builtins: list[Builtin]
    starters: list[Starter] = []

    def starter(self, ref: str) -> Starter | None:
        """The suggested program for a preset."""
        return next((starter for starter in self.starters if starter.ref == ref), None)

    def examples(self) -> list[Example]:
        """Every example, in group order."""
        return [example for group in self.groups for example in group.examples]

    def example(self, example_id: str) -> Example | None:
        """One example by id."""
        return next((example for example in self.examples() if example.id == example_id), None)

    def tutorial(self, tutorial_id: str) -> Tutorial | None:
        """One tutorial by id."""
        return next((tutorial for tutorial in self.tutorials if tutorial.id == tutorial_id), None)

    def chapter(self, slug: str) -> Chapter | None:
        """One chapter by slug."""
        return next((chapter for chapter in self.chapters if chapter.slug == slug), None)

    def toc(self) -> list[ChapterSummary]:
        """The table of contents."""
        return [
            ChapterSummary.model_validate(chapter.model_dump(include=set(ChapterSummary.model_fields)))
            for chapter in self.chapters
        ]


def _load_yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text())
    except yaml.YAMLError as error:
        raise ContentError(f"{path.name}: {error}") from error


def load_groups(directory: Path = EXAMPLES_DIR) -> list[ExampleGroup]:
    """Every example group, one file each, sorted by order then id."""
    groups: list[ExampleGroup] = []
    for path in sorted(directory.glob("*.yaml")):
        try:
            group = ExampleGroup.model_validate(_load_yaml(path))
        except ValueError as error:
            raise ContentError(f"{path.name}: {error}") from error
        for example in group.examples:
            example.group = group.id
        groups.append(group)
    groups.sort(key=lambda group: (group.order, group.id))
    return groups


def load_tutorials(directory: Path = TUTORIALS_DIR) -> list[Tutorial]:
    """Every tutorial, sorted by level, order and id."""
    tutorials: list[Tutorial] = []
    for path in sorted(directory.glob("*.yaml")):
        try:
            tutorials.append(Tutorial.model_validate(_load_yaml(path)))
        except ValueError as error:
            raise ContentError(f"{path.name}: {error}") from error
    tutorials.sort(key=lambda tutorial: (tutorial.level, tutorial.order, tutorial.id))
    return tutorials


def parse_chapter(path: Path) -> Chapter:
    """One chapter: frontmatter, markdown, and the snippets inside it."""
    text = path.read_text()
    match = FRONTMATTER.match(text)
    if match is None:
        raise ContentError(f"{path.name}: a chapter starts with --- frontmatter ---")
    meta: dict[str, Any] = yaml.safe_load(match["meta"]) or {}
    body = text[match.end() :]
    number_text, _, slug = path.stem.partition("-")
    snippets: list[Snippet] = []

    def replace(block: re.Match[str]) -> str:
        raw: dict[str, Any] = yaml.safe_load(block["body"]) or {}
        spec: dict[str, Any] = {}
        if "ref" in raw:
            spec["ref"] = raw.pop("ref")
        if "input" in raw:
            spec["text"] = raw.pop("input")
        snippet_id = f"{slug}-{len(snippets) + 1}"
        try:
            snippet = Snippet.model_validate(
                {**raw, "id": snippet_id, "input": InputSpec.model_validate(spec) if spec else None}
            )
        except ValueError as error:
            raise ContentError(f"{path.name}: snippet {len(snippets) + 1}: {error}") from error
        snippets.append(snippet)
        return f"<!-- snippet:{snippet_id} -->"

    markdown = SNIPPET_BLOCK.sub(replace, body)
    try:
        return Chapter.model_validate(
            {**meta, "slug": slug, "number": int(number_text), "markdown": markdown, "snippets": snippets}
        )
    except ValueError as error:
        raise ContentError(f"{path.name}: {error}") from error


def load_chapters(directory: Path = GUIDE_DIR) -> list[Chapter]:
    """Every guide chapter, in number order."""
    chapters = [parse_chapter(path) for path in sorted(directory.glob("*.md"))]
    chapters.sort(key=lambda chapter: chapter.number)
    return chapters


def load_builtins(path: Path = BUILTINS_FILE) -> list[Builtin]:
    """The builtin catalogue."""
    if not path.is_file():
        return []
    return TypeAdapter(list[Builtin]).validate_python(_load_yaml(path) or [])


def load_starters(path: Path = STARTERS_FILE) -> list[Starter]:
    """The suggested program per preset."""
    if not path.is_file():
        return []
    raw: Any = _load_yaml(path) or {}
    try:
        return TypeAdapter(list[Starter]).validate_python(raw.get("starters", []))
    except ValueError as error:
        raise ContentError(f"{path.name}: {error}") from error


def load_library() -> Library:
    """Load and validate all content, refusing duplicates."""
    library = Library(
        groups=load_groups(),
        tutorials=load_tutorials(),
        chapters=load_chapters(),
        builtins=load_builtins(),
        starters=load_starters(),
    )
    _refuse_duplicates("example", [example.id for example in library.examples()])
    _refuse_duplicates("tutorial", [tutorial.id for tutorial in library.tutorials])
    _refuse_duplicates("chapter", [chapter.slug for chapter in library.chapters])
    _refuse_duplicates("starter", [starter.ref for starter in library.starters])
    if library.chapters:
        slugs = {chapter.slug for chapter in library.chapters}
        linked = [(example.id, slug) for example in library.examples() for slug in example.guide]
        linked += [(tutorial.id, slug) for tutorial in library.tutorials for slug in tutorial.guide]
        unknown = [f"{owner} -> {slug}" for owner, slug in linked if slug not in slugs]
        if unknown:
            raise ContentError("guide links to chapters that do not exist: " + ", ".join(unknown))
    return library


@lru_cache(maxsize=1)
def cached_library() -> Library:
    """The library, loaded once per process."""
    return load_library()


def _refuse_duplicates(kind: str, ids: list[str]) -> None:
    seen: set[str] = set()
    for identifier in ids:
        if identifier in seen:
            raise ContentError(f"the {kind} id {identifier} is used twice")
        seen.add(identifier)
