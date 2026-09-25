"""Print every runnable content item as JSON, for the browser tests to iterate over."""

import json

from playground_jq.content.library import load_library
from playground_jq.content.verify import items


def main() -> None:
    """One JSON array: kind, id, program, input, options and check of every item."""
    library = load_library()
    chapter_of = {snippet.id: chapter.slug for chapter in library.chapters for snippet in chapter.snippets}
    found = [
        {
            **item.model_dump(mode="json", include={"kind", "id", "program", "input", "options", "check"}),
            "chapter": chapter_of.get(item.id),
        }
        for item in items(library)
        if item.kind in {"example", "tutorial", "snippet"}
    ]
    print(json.dumps(found))


if __name__ == "__main__":
    main()
