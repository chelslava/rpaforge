"""
Built-in activities for RPAForge.

These activities are always available and don't require additional libraries.
"""

from __future__ import annotations

from rpaforge.sdk import (
    activity,
    ActivityType,
    Param,
    ParamType,
    Port,
    PortType,
)


@activity(
    name="Log",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Log a message to the console",
    icon="📝",
    params=[
        Param(
            "message", ParamType.STRING, "Message", "The message to log", required=True
        ),
    ],
    rf_keyword="Log",
    rf_library="BuiltIn",
)
class Log:
    """Log activity - logs a message."""


@activity(
    name="Set Variable",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Set a variable value",
    icon="📝",
    params=[
        Param("name", ParamType.VARIABLE, "Variable Name", required=True),
        Param("value", ParamType.STRING, "Value", required=True),
    ],
    rf_keyword="Set Variable",
    rf_library="BuiltIn",
)
class SetVariable:
    """Set Variable activity."""


@activity(
    name="Get Variable",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Get a variable value",
    icon="📥",
    params=[
        Param("name", ParamType.VARIABLE, "Variable Name", required=True),
    ],
    rf_keyword="Get Variable",
    rf_library="BuiltIn",
)
class GetVariable:
    """Get Variable activity."""


@activity(
    name="Run Keyword If",
    type=ActivityType.CONDITION,
    category="BuiltIn",
    description="Run keyword if condition is true",
    icon="❓",
    params=[
        Param("condition", ParamType.EXPRESSION, "Condition", required=True),
        Param("keyword", ParamType.STRING, "Keyword", required=True),
    ],
    rf_keyword="Run Keyword If",
    rf_library="BuiltIn",
)
class RunKeywordIf:
    """Run Keyword If activity."""


@activity(
    name="Wait Until Keyword Succeeds",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Wait until keyword succeeds with retry",
    icon="⏳",
    params=[
        Param("retry", ParamType.STRING, "Retry Count", default="3x"),
        Param("interval", ParamType.STRING, "Retry Interval", default="2s"),
        Param("keyword", ParamType.STRING, "Keyword", required=True),
    ],
    has_retry=True,
    rf_keyword="Wait Until Keyword Succeeds",
    rf_library="BuiltIn",
)
class WaitUntilKeywordSucceeds:
    """Wait Until Keyword Succeeds activity."""


@activity(
    name="Fail",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Fail the test with a message",
    icon="❌",
    params=[
        Param("message", ParamType.STRING, "Error Message", required=True),
    ],
    rf_keyword="Fail",
    rf_library="BuiltIn",
)
class Fail:
    """Fail activity - causes test to fail."""


@activity(
    name="Pass Execution",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Pass the test with a message",
    icon="✅",
    params=[
        Param("message", ParamType.STRING, "Message", required=True),
    ],
    rf_keyword="Pass Execution",
    rf_library="BuiltIn",
)
class PassExecution:
    """Pass Execution activity."""


@activity(
    name="Sleep",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Sleep for a duration",
    icon="💤",
    params=[
        Param(
            "time",
            ParamType.STRING,
            "Duration",
            "Time to sleep (e.g., 2s, 500ms)",
            default="1s",
        ),
    ],
    has_timeout=True,
    rf_keyword="Sleep",
    rf_library="BuiltIn",
)
class Sleep:
    """Sleep activity."""


@activity(
    name="Evaluate",
    type=ActivityType.CODE,
    category="BuiltIn",
    description="Evaluate a Python expression",
    icon="🐍",
    params=[
        Param("expression", ParamType.EXPRESSION, "Expression", required=True),
    ],
    rf_keyword="Evaluate",
    rf_library="BuiltIn",
)
class Evaluate:
    """Evaluate Python expression."""


@activity(
    name="Call Method",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Call a method on an object",
    icon="📞",
    params=[
        Param("object", ParamType.VARIABLE, "Object", required=True),
        Param("method", ParamType.STRING, "Method Name", required=True),
    ],
    rf_keyword="Call Method",
    rf_library="BuiltIn",
)
class CallMethod:
    """Call Method activity."""


@activity(
    name="Get Time",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Get current time",
    icon="🕐",
    params=[
        Param("format", ParamType.STRING, "Format", default="timestamp"),
    ],
    rf_keyword="Get Time",
    rf_library="BuiltIn",
)
class GetTime:
    """Get Time activity."""


@activity(
    name="Import Library",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Import a Robot Framework library",
    icon="📦",
    params=[
        Param("name", ParamType.STRING, "Library Name", required=True),
        Param("args", ParamType.LIST, "Arguments", default=[]),
    ],
    rf_keyword="Import Library",
    rf_library="BuiltIn",
)
class ImportLibrary:
    """Import Library activity."""


@activity(
    name="For Loop",
    type=ActivityType.LOOP,
    category="Flow Control",
    description="Iterate over a collection",
    icon="🔄",
    params=[
        Param("variable", ParamType.VARIABLE, "Loop Variable", default="${item}"),
        Param("collection", ParamType.LIST, "Collection", default="@{items}"),
    ],
    has_nested=True,
)
class ForLoop:
    """For Loop activity."""


@activity(
    name="While Loop",
    type=ActivityType.LOOP,
    category="Flow Control",
    description="Loop while condition is true",
    icon="🔄",
    params=[
        Param("condition", ParamType.EXPRESSION, "Condition", default="${True}"),
        Param("limit", ParamType.INTEGER, "Max Iterations", default=100),
    ],
    has_nested=True,
)
class WhileLoop:
    """While Loop activity."""


@activity(
    name="If Condition",
    type=ActivityType.CONDITION,
    category="Flow Control",
    description="Execute if condition is true",
    icon="❓",
    params=[
        Param("condition", ParamType.EXPRESSION, "Condition", required=True),
    ],
    has_nested=True,
    inputs=[Port("input", PortType.FLOW)],
    outputs=[
        Port("true", PortType.FLOW, "True"),
        Port("false", PortType.FLOW, "False"),
    ],
)
class IfCondition:
    """If Condition activity."""


@activity(
    name="Try Catch",
    type=ActivityType.ERROR_HANDLER,
    category="Error Handling",
    description="Handle exceptions",
    icon="⚠️",
    params=[
        Param("exception_type", ParamType.STRING, "Exception Type", default="*"),
    ],
    has_nested=True,
)
class TryCatch:
    """Try Catch activity."""


@activity(
    name="Comment",
    type=ActivityType.SYNC,
    category="BuiltIn",
    description="Add a comment",
    icon="💬",
    params=[
        Param("message", ParamType.STRING, "Comment", required=True),
    ],
    rf_keyword="Comment",
    rf_library="BuiltIn",
)
class Comment:
    """Comment activity."""


def register_builtin_activities():
    """Register all built-in activities.

    This function is called on import to ensure all activities
    are registered in the SDK.
    """
    pass


register_builtin_activities()
