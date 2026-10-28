"""Print every runnable content item as JSON, for the browser tests to iterate over."""

import json

from playground_jq.content.library import load_library
from playground_jq.content.verify import items


def main() -> None:
    """One JSON array: kind, id, program, input, options, check, chapter and group of every item.

    The group is the example group, the tutorial, or the guide chapter: what a sample is taken per.
    """
    library = load_library()
    chapter_of = {snippet.id: chapter.slug for chapter in library.chapters for snippet in chapter.snippets}
    group_of = {example.id: example.group for example in library.examples()}
    found = [
        {
            **item.model_dump(mode="json", include={"kind", "id", "program", "input", "options", "check"}),
            "chapter": chapter_of.get(item.id),
            "group": group_of.get(item.id) or chapter_of.get(item.id) or item.id.split("/")[0],
        }
        for item in items(library)
        if item.kind in {"example", "tutorial", "snippet"}
    ]
    print(json.dumps(found))


if __name__ == "__main__":
    main()
