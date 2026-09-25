"""Examples, tutorials, guide chapters and builtins, as they are authored and served."""

from typing import Literal

from pydantic import BaseModel, Field, JsonValue, model_validator

from playground_jq.jq.models import RunOptions
from playground_jq.sources.base import SourceKind

#: Course levels: 101 is where everyone starts, 201 builds on it, 301 is advanced.
Level = Literal[101, 201, 301]


class InputSpec(BaseModel):
    """The input a program runs over: a source preset (`source:preset`) or inline text."""

    ref: str | None = None
    """A preset reference such as `static:bookstore` or `dhis2:org-units-geojson-level-2`."""

    text: str | None = None
    """Inline input text."""

    @model_validator(mode="after")
    def _exactly_one(self) -> "InputSpec":
        if (self.ref is None) == (self.text is None):
            raise ValueError("an input is either a ref or a text")
        return self

    @property
    def source(self) -> SourceKind | Literal["inline"]:
        """Which source the input comes from, or `inline`."""
        if self.ref is None:
            return "inline"
        source = self.ref.partition(":")[0]
        if source not in ("static", "echo", "dhis2"):
            raise ValueError(f"unknown source in {self.ref}")
        return source  # type: ignore[return-value]


class Check(BaseModel):
    """What a run must produce to pass."""

    expected: list[JsonValue] | None = None
    """Every output, in order. Filled from a reviewed run with `pjq content fill`."""

    digest: str | None = None
    """SHA-256 of the canonical outputs, recorded instead of `expected` when they are large."""

    error: str | None = None
    """A substring of the error the run must fail with, for examples about errors."""

    unordered: bool = False
    """Compare outputs as a multiset instead of in order."""

    geojson: bool = False
    """The single output must validate as GeoJSON."""


class Example(Check):
    """One example in the library."""

    id: str
    """Unique across all examples."""

    title: str
    """Short name."""

    group: str = ""
    """The group it belongs to (set from the group file)."""

    level: Level = 101
    """Difficulty."""

    tags: list[str] = Field(default_factory=lambda: [])
    """Topics, such as builtin names or `geojson`."""

    explanation: str = ""
    """Markdown: what the program does and why it works."""

    program: str
    """The jq program."""

    input: InputSpec
    """What it runs over."""

    options: RunOptions = Field(default_factory=RunOptions)
    """Command-line flags."""

    manual: list[str] = Field(default_factory=lambda: [])
    """Links into the jq manual."""

    guide: list[str] = Field(default_factory=lambda: [])
    """Guide chapter slugs that explain it."""

    live: bool = True
    """For a live-source input: whether `verify --live` also runs it against the live source."""

    attribution: str | None = None
    """Where the example comes from, when it is not original."""


class ExampleGroup(BaseModel):
    """A group of examples, one file under `examples/`."""

    id: str
    title: str
    description: str = ""
    order: int = 100
    track: Literal["language", "dhis2", "echo", "patterns", "manual"] = "language"
    examples: list[Example]


class TutorialStep(Check):
    """One step of a tutorial."""

    title: str
    """Short name of the step."""

    body: str
    """Markdown explanation shown before the task."""

    task: str
    """What the learner is asked to produce."""

    hints: list[str] = Field(default_factory=lambda: [])
    """Hints, revealed one at a time."""

    solution: str
    """The reference program."""

    starter: str = "."
    """The program the editor starts with."""

    options: RunOptions = Field(default_factory=RunOptions)
    """Command-line flags the step runs with."""

    why: str = ""
    """Markdown shown after solving: why the solution works."""


class Tutorial(BaseModel):
    """A guided tutorial over one static dataset."""

    id: str
    level: Level
    order: int = 100
    title: str
    summary: str
    input: InputSpec
    guide: list[str] = Field(default_factory=lambda: [])
    steps: list[TutorialStep]

    @model_validator(mode="after")
    def _static_only(self) -> "Tutorial":
        if self.input.source not in ("static", "inline"):
            raise ValueError("tutorials run over static datasets only")
        return self


class Snippet(Check):
    """A runnable snippet inside a guide chapter."""

    id: str
    """`<chapter>-<n>`."""

    program: str
    input: InputSpec | None = None
    options: RunOptions = Field(default_factory=RunOptions)
    caption: str = ""
    cli_only: bool = False


class ChapterSummary(BaseModel):
    """A chapter in the table of contents."""

    slug: str
    number: int
    title: str
    summary: str
    level: Level


class Chapter(ChapterSummary):
    """A guide chapter: markdown with runnable snippets."""

    markdown: str
    """The chapter text; each snippet is replaced by a `<!-- snippet:ID -->` marker."""

    snippets: list[Snippet]


class Starter(Check):
    """The program the playground suggests when a dataset or snapshot is loaded."""

    ref: str
    """The preset it belongs to, as `source:preset`."""

    program: str
    """The suggested program."""

    options: RunOptions = Field(default_factory=RunOptions)
    """Flags it runs with."""


class Builtin(BaseModel):
    """One builtin function or operator of jq."""

    name: str
    """Name, as used in a program."""

    signatures: list[str]
    """Every form, such as `map(f)` or `splits(re; flags)`."""

    summary: str
    """One line."""

    section: str
    """The manual section it is documented in."""

    body: str = ""
    """The manual's description (markdown)."""

    manual: str
    """Link into the jq manual."""
