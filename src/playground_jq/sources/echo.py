"""postman-echo: a service that answers with the request it received, so the shape of HTTP is the input."""

import json
from typing import Any, Literal

import httpx2 as httpx
from pydantic import BaseModel, Field, JsonValue, ValidationError

from playground_jq.config import Settings
from playground_jq.errors import Refusal
from playground_jq.sources.base import Fetched, FetchRequest, Preset, SourceInfo, TtlCache, dump_json, snapshot_path

#: Response headers dropped from what is shown, because they identify the caller.
PRIVATE_HEADERS = frozenset({"x-forwarded-for", "x-real-ip", "cf-connecting-ip", "x-amzn-trace-id", "cookie"})

#: The user agent requests are sent with.
USER_AGENT = "playground-jq"


class EchoRequest(BaseModel):
    """One request to postman-echo."""

    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "GET"
    path: str = "/get"
    query: dict[str, str | list[str]] = Field(default_factory=lambda: {})
    headers: dict[str, str] = Field(default_factory=lambda: {})
    json_body: JsonValue | None = None
    form: dict[str, str] | None = None


PRESETS: list[tuple[Preset, EchoRequest]] = [
    (
        Preset(
            id="get-args",
            title="GET with query parameters",
            description="Query parameters come back under `args`; a repeated parameter becomes an array.",
            tags=["http", "args"],
        ),
        EchoRequest(path="/get", query={"name": "playground", "lang": "jq", "tag": ["json", "cli", "filter"]}),
    ),
    (
        Preset(
            id="post-json",
            title="POST a JSON order",
            description="A JSON body is echoed twice: parsed under `json` and as `data`.",
            tags=["http", "body"],
        ),
        EchoRequest(
            method="POST",
            path="/post",
            query={"source": "playground"},
            json_body={
                "order": "A-1001",
                "customer": {"name": "Ada Lovelace", "email": "ada@example.org"},
                "items": [
                    {"sku": "BOOK-1", "title": "Learning jq", "qty": 2, "price": 19.5},
                    {"sku": "MUG-7", "title": "JSON mug", "qty": 1, "price": 9.0},
                    {"sku": "STK-3", "title": "Sticker pack", "qty": 4, "price": 2.25},
                ],
                "paid": True,
            },
        ),
    ),
    (
        Preset(
            id="post-form",
            title="POST a form",
            description="Form fields come back under `form`; `json` is null.",
            tags=["http", "body"],
        ),
        EchoRequest(method="POST", path="/post", form={"username": "ada", "plan": "pro", "newsletter": "yes"}),
    ),
    (
        Preset(
            id="put-json",
            title="PUT a JSON document",
            description="The same echo shape for PUT, with a nested settings document.",
            tags=["http", "body"],
        ),
        EchoRequest(
            method="PUT",
            path="/put",
            json_body={"id": 42, "settings": {"theme": "dark", "editor": {"tabSize": 2, "minimap": False}}},
        ),
    ),
    (
        Preset(
            id="headers",
            title="Request headers",
            description="The headers the request was sent with, lower-cased.",
            tags=["http", "headers"],
        ),
        EchoRequest(
            path="/headers",
            headers={"X-Request-Id": "req-7f3a", "X-Tenant": "sierra-leone", "Accept": "application/json"},
        ),
    ),
    (
        Preset(
            id="response-headers",
            title="Chosen response headers",
            description="postman-echo answers with the query parameters as a JSON object.",
            tags=["http", "headers"],
        ),
        EchoRequest(
            path="/response-headers", query={"Cache-Control": "no-store", "X-Rate-Limit": "100", "X-Version": "2.43"}
        ),
    ),
    (
        Preset(
            id="gzip",
            title="A gzipped response",
            description="A response that was gzip-compressed, with the method and headers echoed.",
            tags=["http"],
        ),
        EchoRequest(path="/gzip"),
    ),
    (
        Preset(
            id="status-418",
            title="Status 418",
            description="An error status answers with a tiny body naming the status.",
            tags=["http", "status"],
        ),
        EchoRequest(path="/status/418"),
    ),
]


class EchoSource:
    """postman-echo, live or from recorded snapshots."""

    def __init__(self, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        """Remember where postman-echo is and how long answers are cached."""
        self.settings = settings
        self.transport = transport
        self.presets = {preset.id: (preset, request) for preset, request in PRESETS}
        self.cache = TtlCache(settings.source_cache_seconds)

    def info(self) -> SourceInfo:
        """Describe postman-echo and its presets."""
        presets = [
            preset.model_copy(update={"request": request.model_dump(mode="json", exclude_none=True)})
            for preset, request in self.presets.values()
        ]
        return SourceInfo(
            id="echo",
            title="postman-echo",
            description="An HTTP echo service: whatever you send comes back as JSON describing the request.",
            live=True,
            available=True,
            presets=presets,
            base_url=self.settings.echo_base_url,
        )

    def resolve(self, request: FetchRequest) -> EchoRequest:
        """The request to send: the preset's, overridden by any custom fields."""
        base: dict[str, Any] = {}
        if request.preset is not None:
            if request.preset not in self.presets:
                raise Refusal(
                    f"there is no postman-echo preset named {request.preset}", code="unknown_preset", status=404
                )
            base = self.presets[request.preset][1].model_dump()
        try:
            resolved = EchoRequest.model_validate({**base, **request.request})
        except ValidationError as error:
            raise Refusal(
                f"the postman-echo request is not valid: {error}", code="request_invalid", status=422
            ) from error
        if not resolved.path.startswith("/"):
            raise Refusal("the postman-echo path must start with /", code="request_invalid", status=422)
        return resolved

    async def fetch(self, request: FetchRequest) -> Fetched:
        """Send the request, or read the preset's snapshot."""
        if request.mode == "snapshot":
            if request.preset is None:
                raise Refusal("a snapshot is read by preset", code="preset_required", status=422)
            path = snapshot_path("echo", request.preset)
            if not path.is_file():
                raise Refusal(f"no snapshot is recorded for {request.preset}", code="no_snapshot", status=404)
            text = path.read_text()
            return Fetched(
                source="echo", preset=request.preset, text=text, format="json", snapshot=True, bytes=len(text.encode())
            )
        echo = self.resolve(request)
        key = echo.model_dump_json()
        url = self.settings.echo_base_url.rstrip("/") + echo.path
        cached = self.cache.get(key)
        if cached is not None:
            return Fetched(
                source="echo",
                preset=request.preset,
                text=cached,
                format="json",
                snapshot=False,
                cached=True,
                url=url,
                bytes=len(cached.encode()),
            )
        body = await self.send(echo)
        text = dump_json(body)
        self.cache.put(key, text)
        return Fetched(
            source="echo",
            preset=request.preset,
            text=text,
            format="json",
            snapshot=False,
            url=url,
            bytes=len(text.encode()),
        )

    async def send(self, echo: EchoRequest) -> JsonValue:
        """Send one request to postman-echo and read its JSON answer."""
        headers = {"User-Agent": USER_AGENT, **echo.headers}
        try:
            async with httpx.AsyncClient(
                base_url=self.settings.echo_base_url,
                timeout=self.settings.source_timeout_seconds,
                follow_redirects=True,
                transport=self.transport,
            ) as client:
                response = await client.request(
                    echo.method,
                    echo.path,
                    params=echo.query,
                    headers=headers,
                    json=echo.json_body if echo.form is None else None,
                    data=echo.form,
                )
        except httpx.HTTPError as error:
            raise Refusal(
                f"postman-echo could not be reached: {error}", code="source_unreachable", status=502
            ) from error
        try:
            body: JsonValue = response.json()
        except json.JSONDecodeError as error:
            snippet = response.text[:200]
            raise Refusal(
                f"postman-echo answered with something other than JSON: {snippet}", code="source_not_json", status=502
            ) from error
        return scrub(body)


def scrub(value: JsonValue) -> JsonValue:
    """Drop headers that identify the caller from an echoed response."""
    if isinstance(value, dict):
        return {key: scrub(item) for key, item in value.items() if key.lower() not in PRIVATE_HEADERS}
    if isinstance(value, list):
        return [scrub(item) for item in value]
    return value
