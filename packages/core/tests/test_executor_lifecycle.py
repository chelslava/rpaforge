"""Tests for lazy ProcessExecutor resource ownership."""

from __future__ import annotations

from unittest import mock

from rpaforge.core.executor import ProcessExecutor


def test_process_executor_does_not_construct_subprocess_runners_eagerly():
    with (
        mock.patch("rpaforge.core.executor.SubprocessExecutor") as subprocess,
        mock.patch("rpaforge.core.executor.LibraryRunner") as library_runner,
    ):
        executor = ProcessExecutor()

    assert executor._subprocess_executor is None
    assert executor._library_runner is None
    subprocess.assert_not_called()
    library_runner.assert_not_called()
    executor.close()
    subprocess.assert_not_called()
    library_runner.assert_not_called()
