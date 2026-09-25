"""playground-jq: a playground, language guide, tutorials and example library for learning jq."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("playground-jq")
except PackageNotFoundError:  # pragma: no cover - running from a source tree without metadata
    __version__ = "0.0.0"
