"""
RPAForge Checkpoint System.

Provides state recovery after mid-process crashes by persisting execution
state to disk at configurable intervals.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

from rpaforge.core.models import Breakpoint, CallFrame

logger = logging.getLogger("rpaforge")

DEFAULT_CHECKPOINT_DIR = ".rpaforge_checkpoints"
DEFAULT_CHECKPOINT_FREQUENCY = 10
DEFAULT_KEEP_CHECKPOINTS = 3


class CheckpointState(Enum):
    """State of the process when checkpoint was created."""

    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"


@dataclass
class CheckpointData:
    """Data structure for checkpoint persistence.

    Contains all information needed to resume execution after a crash.
    """

    version: str = "1.0"
    timestamp: str = ""
    process_name: str = ""
    current_node_id: str = ""
    current_task_name: str = ""
    state: str = ""
    variables: dict[str, Any] = field(default_factory=dict)
    call_stack: list[dict[str, Any]] = field(default_factory=list)
    breakpoints: dict[str, dict[str, Any]] = field(default_factory=dict)
    activity_count: int = 0
    checkpoint_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "timestamp": self.timestamp,
            "process_name": self.process_name,
            "current_node_id": self.current_node_id,
            "current_task_name": self.current_task_name,
            "state": self.state,
            "variables": self.variables,
            "call_stack": self.call_stack,
            "breakpoints": self.breakpoints,
            "activity_count": self.activity_count,
            "checkpoint_id": self.checkpoint_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CheckpointData:
        return cls(
            version=data.get("version", "1.0"),
            timestamp=data.get("timestamp", ""),
            process_name=data.get("process_name", ""),
            current_node_id=data.get("current_node_id", ""),
            current_task_name=data.get("current_task_name", ""),
            state=data.get("state", ""),
            variables=data.get("variables", {}),
            call_stack=data.get("call_stack", []),
            breakpoints=data.get("breakpoints", {}),
            activity_count=data.get("activity_count", 0),
            checkpoint_id=data.get("checkpoint_id", ""),
        )


class CheckpointManager:
    """Manages checkpoint persistence for crash recovery.

    Saves execution state to disk at configurable intervals and provides
    methods for loading checkpoints and restoring state.
    """

    def __init__(
        self,
        checkpoint_dir: str | Path | None = None,
        frequency: int = DEFAULT_CHECKPOINT_FREQUENCY,
        keep_last: int = DEFAULT_KEEP_CHECKPOINTS,
    ) -> None:
        self._checkpoint_dir = (
            Path(checkpoint_dir) if checkpoint_dir else Path(DEFAULT_CHECKPOINT_DIR)
        )
        self._frequency = max(1, frequency)
        self._keep_last = max(1, keep_last)
        self._lock = threading.Lock()
        self._checkpoint_id = 0
        self._ensure_checkpoint_dir()

    def _ensure_checkpoint_dir(self) -> None:
        """Ensure checkpoint directory exists."""
        try:
            self._checkpoint_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.warning(f"Failed to create checkpoint dir: {e}")
            self._checkpoint_dir = Path(DEFAULT_CHECKPOINT_DIR)
            self._checkpoint_dir.mkdir(parents=True, exist_ok=True)

    def _get_next_checkpoint_id(self) -> str:
        self._checkpoint_id += 1
        return f"cp_{self._checkpoint_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    def save(
        self,
        process_name: str,
        current_node_id: str,
        current_task_name: str,
        state: str,
        variables: dict[str, Any],
        call_stack: list[CallFrame],
        breakpoints: dict[str, Breakpoint],
        activity_count: int,
    ) -> str | None:
        """Save checkpoint to disk.

        Returns the checkpoint ID if successful, None otherwise.
        """
        checkpoint_id = self._get_next_checkpoint_id()

        call_stack_data = []
        for frame in call_stack:
            call_stack_data.append(
                {
                    "activity": frame.activity,
                    "library": frame.library,
                    "line": frame.line,
                    "node_id": frame.node_id,
                    "args": list(frame.args) if frame.args else [],
                }
            )

        breakpoints_data = {}
        for bp_id, bp in breakpoints.items():
            breakpoints_data[bp_id] = {
                "id": bp.id,
                "node_id": bp.node_id,
                "line": bp.line,
                "enabled": bp.enabled,
                "condition": bp.condition,
                "hit_count": bp.hit_count,
                "hit_condition": bp.hit_condition,
            }

        checkpoint = CheckpointData(
            timestamp=datetime.now().isoformat(),
            process_name=process_name,
            current_node_id=current_node_id,
            current_task_name=current_task_name,
            state=state,
            variables=variables,
            call_stack=call_stack_data,
            breakpoints=breakpoints_data,
            activity_count=activity_count,
            checkpoint_id=checkpoint_id,
        )

        checkpoint_path = self._checkpoint_dir / f"{checkpoint_id}.json"

        try:
            with self._lock:
                with open(checkpoint_path, "w", encoding="utf-8") as f:
                    json.dump(checkpoint.to_dict(), f, indent=2, default=str)
                logger.debug(f"Checkpoint saved: {checkpoint_id}")
                self._cleanup_old_checkpoints()
            return checkpoint_id
        except OSError as e:
            logger.error(f"Failed to save checkpoint: {e}")
            return None

    def load(self) -> CheckpointData | None:
        """Load the most recent checkpoint.

        Returns None if no checkpoint exists.
        """
        try:
            with self._lock:
                checkpoints = sorted(
                    self._checkpoint_dir.glob("*.json"),
                    key=lambda p: p.stat().st_mtime,
                    reverse=True,
                )

                if not checkpoints:
                    return None

                latest = checkpoints[0]
                with open(latest, encoding="utf-8") as f:
                    data = json.load(f)
                return CheckpointData.from_dict(data)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning(f"Failed to load checkpoint: {e}")
            return None

    def clear(self) -> bool:
        """Clear all checkpoints.

        Returns True if successful.
        """
        try:
            with self._lock:
                for checkpoint_file in self._checkpoint_dir.glob("*.json"):
                    checkpoint_file.unlink()
                logger.debug("All checkpoints cleared")
            return True
        except OSError as e:
            logger.error(f"Failed to clear checkpoints: {e}")
            return False

    def has_checkpoint(self) -> bool:
        """Check if a checkpoint exists."""
        try:
            with self._lock:
                return bool(list(self._checkpoint_dir.glob("*.json")))
        except OSError:
            return False

    def get_checkpoint_info(self) -> dict[str, Any] | None:
        """Get info about the latest checkpoint without full loading."""
        checkpoint = self.load()
        if checkpoint is None:
            return None
        return {
            "checkpoint_id": checkpoint.checkpoint_id,
            "timestamp": checkpoint.timestamp,
            "process_name": checkpoint.process_name,
            "activity_count": checkpoint.activity_count,
            "current_node_id": checkpoint.current_node_id,
        }

    def _cleanup_old_checkpoints(self) -> None:
        """Remove old checkpoints, keeping only the most recent N."""
        try:
            checkpoints = sorted(
                self._checkpoint_dir.glob("*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )

            for old_cp in checkpoints[self._keep_last :]:
                old_cp.unlink()
                logger.debug(f"Removed old checkpoint: {old_cp.name}")
        except OSError as e:
            logger.warning(f"Failed to cleanup old checkpoints: {e}")

    def should_checkpoint(self, activity_count: int) -> bool:
        """Check if a checkpoint should be created based on activity count."""
        return activity_count > 0 and activity_count % self._frequency == 0

    @property
    def frequency(self) -> int:
        """Get checkpoint frequency (activities between checkpoints)."""
        return self._frequency

    @frequency.setter
    def frequency(self, value: int) -> None:
        """Set checkpoint frequency."""
        self._frequency = max(1, value)

    @property
    def checkpoint_dir(self) -> Path:
        """Get checkpoint directory path."""
        return self._checkpoint_dir

    def set_checkpoint_dir(self, path: str | Path) -> None:
        """Set checkpoint directory and ensure it exists."""
        with self._lock:
            self._checkpoint_dir = Path(path)
            self._ensure_checkpoint_dir()
