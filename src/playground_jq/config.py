"""Settings, read from the environment and a `.env` file."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Everything the server and the CLI can be configured with."""

    model_config = SettingsConfigDict(
        env_prefix="PLAYGROUND_JQ_",
        env_file=".env",
        extra="ignore",
        frozen=True,
        use_attribute_docstrings=True,
    )

    host: str = "127.0.0.1"
    """Interface the server listens on."""

    port: int = 8765
    """Port the server listens on."""

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    """Minimum level logged."""

    log_format: Literal["auto", "console", "json"] = "auto"
    """Log rendering: console on a terminal and JSON otherwise when `auto`."""

    api_prefix: str = "/api"
    """Prefix every API route is mounted under."""

    ui_enabled: bool = True
    """Serve the built web UI from the same origin as the API."""

    ui_dir: Path | None = None
    """A built UI bundle to serve instead of the packaged or checkout one."""

    jq_timeout_seconds: float = 2.0
    """Wall-clock limit for one jq run; the process running it is killed when it is reached."""

    jq_max_input_bytes: int = 20_000_000
    """Largest input text a run accepts."""

    jq_max_outputs: int = 10_000
    """Outputs kept from one run; the rest are dropped and the result is marked truncated."""

    jq_max_output_bytes: int = 5_000_000
    """Largest formatted output kept from one run."""

    jq_binary: str = "jq"
    """The jq executable used for features only the command line has, such as `inputs` and `--stream`."""

    dhis2_profile: str = "play43"
    """dhis2w profile the DHIS2 source connects with."""

    dhis2_enabled: bool = True
    """Connect to DHIS2 at startup; when off, DHIS2 examples fall back to recorded snapshots."""

    echo_base_url: str = "https://postman-echo.com"
    """Base URL of the postman-echo service."""

    source_timeout_seconds: float = 30.0
    """Timeout for one request to a live source."""

    source_cache_seconds: float = 300.0
    """How long a live source response is reused before it is fetched again."""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """The process-wide settings, read once."""
    return Settings()


def reset_settings_cache() -> None:
    """Forget the cached settings so the next read sees the current environment."""
    get_settings.cache_clear()
