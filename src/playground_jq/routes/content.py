"""Examples, tutorials, the guide and the builtin reference."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, JsonValue

from playground_jq.config import Settings
from playground_jq.content.library import Library
from playground_jq.content.models import Builtin, Chapter, ChapterSummary, Example, InputSpec, Level, Tutorial
from playground_jq.content.verify import input_text, judge
from playground_jq.errors import Refusal
from playground_jq.jq.engine import run_program
from playground_jq.jq.models import RunResult
from playground_jq.routes.deps import library_of, settings_of, sources_of
from playground_jq.sources.registry import Sources

router = APIRouter(tags=["content"])


class ExampleSummary(BaseModel):
    """An example in a listing."""

    id: str
    title: str
    group: str
    level: Level
    tags: list[str]
    source: str
    program: str


class GroupOut(BaseModel):
    """An example group with its examples summarised."""

    id: str
    title: str
    description: str
    track: str
    examples: list[ExampleSummary]


class TutorialSummary(BaseModel):
    """A tutorial in a listing."""

    id: str
    level: Level
    title: str
    summary: str
    steps: int


class StepCheckRequest(BaseModel):
    """A learner's program for one tutorial step."""

    program: str = Field(max_length=100_000)


class StepCheckResult(BaseModel):
    """Whether a learner's program solves the step."""

    passed: bool
    reason: str
    result: RunResult
    expected: list[JsonValue]


class InputText(BaseModel):
    """The text an input spec resolves to."""

    text: str


@router.get("/examples")
async def list_examples(library: Annotated[Library, Depends(library_of)]) -> list[GroupOut]:
    """Every example group with its examples."""
    return [
        GroupOut(
            id=group.id,
            title=group.title,
            description=group.description,
            track=group.track,
            examples=[
                ExampleSummary(
                    id=example.id,
                    title=example.title,
                    group=group.id,
                    level=example.level,
                    tags=example.tags,
                    source=example.input.source,
                    program=example.program,
                )
                for example in group.examples
            ],
        )
        for group in library.groups
    ]


@router.get("/examples/{example_id}")
async def get_example(example_id: str, library: Annotated[Library, Depends(library_of)]) -> Example:
    """One example in full."""
    example = library.example(example_id)
    if example is None:
        raise Refusal(f"there is no example {example_id}", code="unknown_example", status=404)
    return example


@router.post("/inputs/resolve")
async def resolve_input(spec: InputSpec, sources: Annotated[Sources, Depends(sources_of)]) -> InputText:
    """The input text an example, tutorial or snippet runs over (recorded snapshots for live sources)."""
    return InputText(text=await input_text(spec, sources))


@router.get("/tutorials")
async def list_tutorials(library: Annotated[Library, Depends(library_of)]) -> list[TutorialSummary]:
    """Every tutorial, by level."""
    return [
        TutorialSummary(id=t.id, level=t.level, title=t.title, summary=t.summary, steps=len(t.steps))
        for t in library.tutorials
    ]


@router.get("/tutorials/{tutorial_id}")
async def get_tutorial(tutorial_id: str, library: Annotated[Library, Depends(library_of)]) -> Tutorial:
    """One tutorial with its steps."""
    tutorial = library.tutorial(tutorial_id)
    if tutorial is None:
        raise Refusal(f"there is no tutorial {tutorial_id}", code="unknown_tutorial", status=404)
    return tutorial


@router.post("/tutorials/{tutorial_id}/steps/{number}/check")
async def check_step(
    tutorial_id: str,
    number: int,
    body: StepCheckRequest,
    library: Annotated[Library, Depends(library_of)],
    sources: Annotated[Sources, Depends(sources_of)],
    settings: Annotated[Settings, Depends(settings_of)],
) -> StepCheckResult:
    """Run a learner's program for a step and say whether it produces the expected output."""
    tutorial = library.tutorial(tutorial_id)
    if tutorial is None or not 1 <= number <= len(tutorial.steps):
        raise Refusal(f"there is no step {number} in {tutorial_id}", code="unknown_step", status=404)
    step = tutorial.steps[number - 1]
    text = await input_text(tutorial.input, sources)
    result = await run_program(body.program, text, step.options, settings)
    status, reason = judge(step, result)
    return StepCheckResult(passed=status == "pass", reason=reason, result=result, expected=step.expected or [])


@router.get("/guide")
async def guide_toc(library: Annotated[Library, Depends(library_of)]) -> list[ChapterSummary]:
    """The guide's table of contents."""
    return library.toc()


@router.get("/guide/{slug}")
async def guide_chapter(slug: str, library: Annotated[Library, Depends(library_of)]) -> Chapter:
    """One chapter with its snippets."""
    chapter = library.chapter(slug)
    if chapter is None:
        raise Refusal(f"there is no chapter {slug}", code="unknown_chapter", status=404)
    return chapter


@router.get("/builtins")
async def builtins(library: Annotated[Library, Depends(library_of)]) -> list[Builtin]:
    """Every builtin, for completion, hover and the reference page."""
    return library.builtins
