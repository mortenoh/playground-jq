from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    answered = client.get("/health")
    assert answered.status_code == 200
    assert answered.json()["status"] == "ok"


def test_run_with_inline_input(client: TestClient) -> None:
    answered = client.post("/api/run", json={"program": ".a + 1", "input": '{"a": 41}'})
    assert answered.status_code == 200
    body = answered.json()
    assert body["ok"]
    assert body["outputs"] == [42]
    assert body["text"] == "42\n"


def test_run_with_a_source(client: TestClient) -> None:
    answered = client.post(
        "/api/run",
        json={
            "program": ".features | length",
            "source": {"id": "dhis2", "fetch": {"preset": "org-units-geojson-level-2", "mode": "snapshot"}},
        },
    )
    assert answered.json()["outputs"] == [13]


def test_run_refuses_both_inputs(client: TestClient) -> None:
    answered = client.post("/api/run", json={"program": ".", "input": "1", "source": {"id": "static"}})
    assert answered.status_code == 422
    assert answered.headers["content-type"] == "application/problem+json"
    assert answered.json()["code"] == "request_invalid"


def test_run_compile_error_is_a_result_not_a_failure(client: TestClient) -> None:
    body = client.post("/api/run", json={"program": ".a |", "input": "{}"}).json()
    assert not body["ok"]
    assert body["errors"][0]["kind"] == "compile"


def test_sources(client: TestClient) -> None:
    listed = client.get("/api/sources").json()
    assert [source["id"] for source in listed] == ["static", "echo", "dhis2"]
    fetched = client.post("/api/sources/echo/fetch", json={"preset": "status-418", "mode": "snapshot"})
    assert fetched.json()["text"].strip() == '{\n  "status": 418\n}'


def test_unknown_source_is_a_problem(client: TestClient) -> None:
    answered = client.post("/api/sources/nope/fetch", json={})
    assert answered.status_code == 404
    assert answered.json()["code"] == "unknown_source"


def test_geojson_validate(client: TestClient) -> None:
    answered = client.post("/api/geojson/validate", json={"type": "Point", "coordinates": [1, 2]})
    assert answered.json()["valid"]


def test_unknown_route_is_a_problem(client: TestClient) -> None:
    answered = client.get("/api/nothing")
    assert answered.status_code == 404
    assert answered.json()["code"] == "http_error"
