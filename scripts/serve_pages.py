"""Serve a built static site the way GitHub Pages does: a missing path answers with 404.html.

uv run python scripts/serve_pages.py build/pages 8798
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PagesHandler(SimpleHTTPRequestHandler):
    """Static files, with the site's nearest 404.html for anything missing."""

    def send_error(self, code: int, message: str | None = None, explain: str | None = None) -> None:
        """Answer a 404 with the 404.html of the site the path is under, like GitHub Pages."""
        if code == 404:
            root = Path(self.directory)
            parts = [part for part in self.path.split("?")[0].split("/") if part]
            candidate = root / parts[0] / "404.html" if parts else root / "404.html"
            if candidate.is_file():
                body = candidate.read_bytes()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        super().send_error(code, message, explain)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - the stdlib signature
        """Stay quiet."""


class PagesServer(ThreadingHTTPServer):
    """A threading server with a listen backlog large enough for parallel browsers."""

    request_queue_size = 256
    daemon_threads = True


def main() -> None:
    """Serve a directory on a port."""
    directory = sys.argv[1] if len(sys.argv) > 1 else "build/pages"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8798
    handler = partial(PagesHandler, directory=directory)
    PagesServer(("127.0.0.1", port), handler).serve_forever()


if __name__ == "__main__":
    main()
