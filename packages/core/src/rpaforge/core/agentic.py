"""Agentic Loop execution primitives (issue #736).

An ``agentic-loop`` diagram block lets an LLM plan and invoke a strictly
whitelisted set of activities toward a *goal*, under hard safeguards:

- iteration budget (``max_iterations``),
- total token budget (``max_total_tokens``),
- whitelist enforcement - any requested activity outside the catalog
  aborts the loop toward the fallback path, never executing it,
- full request/observation transcript emitted as events for auditability.

The tool catalog is built from the live activity registry
(:data:`rpaforge.core.activity.ACTIVITY_REGISTRY`) using registry ids
(``Library.activity_id``), so descriptions and parameter metadata always
match what would actually execute - nothing prompt-injectable.

Step protocol (JSON mode over :mod:`rpaforge.llm`): the model answers with

    {"thought": "...", "action": "call" | "finish",
     "activity": "Library.activity_id", "args": {...}, "result": ...}
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from rpaforge.core.activity import ACTIVITY_REGISTRY
from rpaforge.core.execution import ActivityCall, ParallelGroup, TryCatchGroup

__all__ = [
    "EVENT_AGENTIC_ABORT",
    "EVENT_AGENTIC_ITERATION",
    "DEFAULT_MAX_ITERATIONS",
    "DEFAULT_MAX_TOTAL_TOKENS",
    "AgenticLoopGroup",
    "AgentStep",
    "build_tool_catalog",
    "parse_agent_step",
]

#: Emitted after every model round-trip with the step and its observation.
EVENT_AGENTIC_ITERATION = "agentic_iteration"

#: Emitted when the loop aborts (whitelist violation, budgets, model errors).
EVENT_AGENTIC_ABORT = "agentic_abort"

#: Default iteration budget when blockData omits ``max_iterations``.
DEFAULT_MAX_ITERATIONS = 10

#: Default cumulative prompt+completion token budget across the loop.
DEFAULT_MAX_TOTAL_TOKENS = 100_000


@dataclass
class AgenticLoopGroup:
    """Runtime form of an ``agentic-loop`` diagram block."""

    goal: str = ""
    allowed_activities: list[str] = field(default_factory=list)
    max_iterations: int = DEFAULT_MAX_ITERATIONS
    max_total_tokens: int = DEFAULT_MAX_TOTAL_TOKENS
    model: str = ""
    output_variable: str = ""
    #: Per-step execution timeout applied to every agent-invoked activity
    #: (0 = no timeout, matching plain activity blocks).
    step_timeout_ms: int = 0
    fallback_activities: list[ActivityCall | ParallelGroup | TryCatchGroup] = field(
        default_factory=list
    )
    node_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        def _dump(items: list[Any]) -> list[Any]:
            return [
                item.to_dict() if hasattr(item, "to_dict") else repr(item)
                for item in items
            ]

        return {
            "type": "agentic_loop",
            "node_id": self.node_id,
            "goal": self.goal,
            "allowed_activities": list(self.allowed_activities),
            "max_iterations": self.max_iterations,
            "max_total_tokens": self.max_total_tokens,
            "model": self.model,
            "output_variable": self.output_variable,
            "fallback_activities": _dump(self.fallback_activities),
        }


@dataclass(frozen=True)
class AgentStep:
    """One parsed model decision."""

    thought: str = ""
    action: str = ""  # "call" or "finish"
    activity: str = ""
    args: dict[str, Any] = field(default_factory=dict)
    finish_result: Any = None


def build_tool_catalog(allowed_activities: list[str]) -> list[dict[str, Any]]:
    """Build the tool catalog strictly from the live activity registry.

    :param allowed_activities: Registry ids in ``Library.activity_id`` form.
    :returns: Catalog entries with name/description/params metadata.
    :raises KeyError: If an id is not present in the registry - callers
        treat that as a configuration error (validator rejects it earlier).
    """
    catalog: list[dict[str, Any]] = []
    for full_id in allowed_activities:
        meta = ACTIVITY_REGISTRY.get(full_id)
        if meta is None:
            raise KeyError(
                f"Whitelisted activity '{full_id}' is not registered; "
                "check the library is imported and the id matches "
                "'Library.activity_id'."
            )
        catalog.append(
            {
                "id": full_id,
                "name": meta.name,
                "description": meta.description,
                "params": [
                    {
                        "name": param["name"],
                        "type": param.get("type", "string"),
                        "required": param.get("required", False),
                        "default": param.get("default"),
                    }
                    for param in meta.params
                ],
            }
        )
    return catalog


def parse_agent_step(raw_text: str) -> AgentStep:
    """Parse one model response into an :class:`AgentStep`.

    Accepts the documented JSON shape; a bare JSON string is treated as a
    bare activity id (a ``call`` with no args). Raises ``ValueError`` on
    unparseable input or unknown ``action`` values.
    """
    try:
        parsed = json.loads(raw_text.strip())
    except ValueError as err:
        raise ValueError(f"Agent response was not valid JSON: {err}") from err

    if isinstance(parsed, str):
        return AgentStep(action="call", activity=parsed.strip())

    if not isinstance(parsed, dict):
        raise ValueError(
            f"Agent response must be a JSON object, got {type(parsed).__name__}."
        )

    action = str(parsed.get("action", "")).strip().lower()
    if action == "finish":
        return AgentStep(
            thought=str(parsed.get("thought", "")),
            action="finish",
            finish_result=parsed.get("result"),
        )
    if action == "call":
        activity = str(parsed.get("activity", "")).strip()
        if not activity:
            raise ValueError("Agent 'call' step is missing 'activity'.")
        args = parsed.get("args", {})
        if not isinstance(args, dict):
            raise ValueError("Agent step 'args' must be an object.")
        return AgentStep(
            thought=str(parsed.get("thought", "")),
            action="call",
            activity=activity,
            args=dict(args),
        )
    raise ValueError(
        f"Unknown agent action '{action or '(missing)'}'; expected 'call' or 'finish'."
    )


def build_step_call(step: AgentStep, timeout_ms: int = 0) -> ActivityCall:
    """Map a parsed ``call`` step onto an :class:`ActivityCall`.

    Arguments pass as kwargs so partially-supplied optional parameters keep
    their positions; missing required parameters surface as a call error
    observation the agent can correct on the next iteration.
    """
    library, _, activity_id = step.activity.partition(".")
    return ActivityCall(
        library=library,
        activity=activity_id,
        kwargs=dict(step.args),
        timeout_ms=timeout_ms,
    )
