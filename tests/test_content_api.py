from fastapi.testclient import TestClient

from playground_jq.content.library import Library


def test_examples_listing_and_detail(client: TestClient, library: Library) -> None:
    groups = client.get("/api/examples").json()
    assert sum(len(group["examples"]) for group in groups) == len(library.examples())
    first = groups[0]["examples"][0]
    detail = client.get(f"/api/examples/{first['id']}").json()
    assert detail["program"] == first["program"]
    assert client.get("/api/examples/nope").status_code == 404


def test_inputs_resolve(client: TestClient) -> None:
    inline = client.post("/api/inputs/resolve", json={"text": "[1]"}).json()
    assert inline == {"text": "[1]"}
    snapshot = client.post("/api/inputs/resolve", json={"ref": "dhis2:org-unit-levels"}).json()
    assert "organisationUnitLevels" in snapshot["text"]


def test_builtins(client: TestClient) -> None:
    names = {builtin["name"] for builtin in client.get("/api/builtins").json()}
    assert {"map", "select", "paths", "@csv"} <= names


def test_sources_carry_starter_programs(client: TestClient) -> None:
    sources = client.get("/api/sources").json()
    presets = {f"{source['id']}:{preset['id']}": preset for source in sources for preset in source["presets"]}
    assert presets["static:bookstore"]["program"]
    assert presets["dhis2:org-unit-levels"]["options"] == {"raw_output": True}


def test_tutorials_and_guide_when_present(client: TestClient, library: Library) -> None:
    tutorials = client.get("/api/tutorials").json()
    assert len(tutorials) == len(library.tutorials)
    assert client.get("/api/tutorials/nope").status_code == 404
    assert client.post("/api/tutorials/nope/steps/1/check", json={"program": "."}).status_code == 404
    toc = client.get("/api/guide").json()
    assert len(toc) == len(library.chapters)
    assert client.get("/api/guide/nope").status_code == 404
    if library.tutorials:
        tutorial = library.tutorials[0]
        step = tutorial.steps[0]
        detail = client.get(f"/api/tutorials/{tutorial.id}").json()
        assert len(detail["steps"]) == len(tutorial.steps)
        solved = client.post(f"/api/tutorials/{tutorial.id}/steps/1/check", json={"program": step.solution}).json()
        assert solved["passed"], solved["reason"]
        wrong = client.post(f"/api/tutorials/{tutorial.id}/steps/1/check", json={"program": "empty"}).json()
        assert not wrong["passed"]
    if library.chapters:
        chapter = library.chapters[0]
        assert client.get(f"/api/guide/{chapter.slug}").json()["title"] == chapter.title
