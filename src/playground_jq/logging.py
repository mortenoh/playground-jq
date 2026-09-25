"""Structured logging: one structlog chain with the standard library bridged into it."""

import logging
import sys
from typing import Any, Literal

import structlog

#: Third-party loggers that are too chatty at INFO.
NOISY_LOGGERS = {"httpx2": logging.WARNING, "httpcore": logging.WARNING, "uvicorn.access": logging.WARNING}

#: Standard-library loggers routed through the same renderer.
BRIDGED_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access", "httpx2", "dhis2w_client", "dhis2w_core")


def configure_logging(level: str = "INFO", fmt: Literal["auto", "console", "json"] = "auto") -> None:
    """Configure structlog and the standard library to render through one processor chain."""
    use_json = fmt == "json" or (fmt == "auto" and not sys.stderr.isatty())
    renderer: Any = structlog.processors.JSONRenderer() if use_json else structlog.dev.ConsoleRenderer()
    shared: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared,
            processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, renderer],
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    for name in BRIDGED_LOGGERS:
        bridged = logging.getLogger(name)
        bridged.handlers = []
        bridged.propagate = True
    for name, minimum in NOISY_LOGGERS.items():
        logging.getLogger(name).setLevel(minimum)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """A logger named under this package."""
    logger: structlog.stdlib.BoundLogger = structlog.stdlib.get_logger(f"playground_jq.{name}")
    return logger
