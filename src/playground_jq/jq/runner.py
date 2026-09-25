"""Runner processes for the jq.py library: a small pool, and a kill when a run times out."""

import asyncio
import atexit
import json
import subprocess
import sys
from pathlib import Path
from typing import IO, Any, cast

#: The child process every library run is evaluated in, started by path.
RUNNER_SCRIPT = Path(__file__).resolve().parent / "jq_runner.py"

#: What a run is told when the process running it stopped before it answered.
RUNNER_STOPPED = "the jq process stopped before it answered"


class RunnerStopped(RuntimeError):
    """The runner process died, was killed, or closed its pipe."""


class ProgramRunner:
    """One runner process and the two pipes a request and its reply cross."""

    def __init__(self) -> None:
        """Start the runner process."""
        self.process = subprocess.Popen(
            (sys.executable, str(RUNNER_SCRIPT)),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
        )
        self._to = cast("IO[bytes]", self.process.stdin)
        self._from = cast("IO[bytes]", self.process.stdout)

    @property
    def alive(self) -> bool:
        """Whether the process is still there to run a program."""
        return self.process.poll() is None

    def exchange(self, request: dict[str, Any]) -> dict[str, Any]:
        """Send one request and read the one reply to it."""
        try:
            self._to.write(json.dumps(request).encode() + b"\n")
            self._to.flush()
            reply = self._from.readline()
        except (OSError, ValueError) as error:
            raise RunnerStopped(RUNNER_STOPPED) from error
        if not reply:
            raise RunnerStopped(RUNNER_STOPPED)
        return cast("dict[str, Any]", json.loads(reply))

    def kill(self) -> None:
        """End whatever is running, reap the process and close its pipes."""
        self.process.kill()
        self.process.wait()
        self._to.close()
        self._from.close()


class RunnerPool:
    """Idle runner processes, handed out one per run and taken back after."""

    def __init__(self, keep: int = 4) -> None:
        """Keep at most `keep` idle processes."""
        self.keep = keep
        self._idle: list[ProgramRunner] = []

    async def take(self) -> ProgramRunner:
        """An idle live process, or a new one started off the event loop."""
        while self._idle:
            runner = self._idle.pop()
            if runner.alive:
                return runner
        return await asyncio.to_thread(ProgramRunner)

    def give_back(self, runner: ProgramRunner) -> None:
        """Keep a live process for the next run, or end it when enough are idle."""
        if not runner.alive:
            return
        if len(self._idle) >= self.keep:
            runner.kill()
            return
        self._idle.append(runner)

    async def run(self, request: dict[str, Any], timeout: float) -> dict[str, Any]:
        """Run one request in a pooled process, killing the process if it takes longer than `timeout`."""
        runner = await self.take()
        try:
            async with asyncio.timeout(timeout):
                return await asyncio.to_thread(runner.exchange, request)
        except (TimeoutError, asyncio.CancelledError):
            runner.kill()
            raise
        finally:
            self.give_back(runner)

    def shutdown(self) -> None:
        """Kill every idle process."""
        while self._idle:
            self._idle.pop().kill()


#: The process-wide pool.
POOL = RunnerPool()

atexit.register(POOL.shutdown)
