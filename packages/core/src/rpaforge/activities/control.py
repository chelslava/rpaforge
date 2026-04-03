from __future__ import annotations

from typing import Any

from rpaforge.sdk import (
    activity,
    ActivityType,
    ActivityContext,
    ExecutionResult,
    Port,
    PortType,
    Property,
    PropertyType,
    BaseActivity,
)


@activity(
    type=ActivityType.CONTROL,
    name="Start",
    category="Flow Control",
    icon="▶",
    description="Entry point of the process",
    input_ports=[],
    output_ports=[Port(id="output", type=PortType.FLOW, required=True, label="Output")],
    properties=[
        Property(
            name="processName",
            type=PropertyType.STRING,
            required=True,
            description="Name of the process",
        ),
        Property(
            name="description",
            type=PropertyType.STRING,
            required=False,
            description="Description of the process",
        ),
        Property(
            name="tags",
            type=PropertyType.ARRAY,
            required=False,
            description="Tags for categorization",
        ),
    ],
    rf_keyword="No Operation",
)
class StartActivity(BaseActivity):
    def __init__(self, context: ActivityContext):
        self.context = context

    def execute(self) -> ExecutionResult:
        process_name = self.context.get_property("processName", "Main Process")
        description = self.context.get_property("description")
        tags = self.context.get_property("tags", [])

        self.context.set_state("process_name", process_name)
        if description:
            self.context.set_state("process_description", description)
        if tags:
            self.context.set_state("process_tags", tags)

        return ExecutionResult(success=True, output_port="output")


@activity(
    type=ActivityType.CONTROL,
    name="End",
    category="Flow Control",
    icon="■",
    description="Exit point of the process",
    input_ports=[Port(id="input", type=PortType.FLOW, required=True, label="Input")],
    output_ports=[],
    properties=[
        Property(
            name="status",
            type=PropertyType.STRING,
            required=False,
            default="pass",
            description="Exit status: pass or fail",
        ),
        Property(
            name="message",
            type=PropertyType.STRING,
            required=False,
            description="Exit message",
        ),
    ],
    rf_keyword="No Operation",
)
class EndActivity(BaseActivity):
    def __init__(self, context: ActivityContext):
        self.context = context

    def execute(self) -> ExecutionResult:
        status = self.context.get_property("status", "pass")
        message = self.context.get_property("message")

        self.context.set_state("process_status", status)
        if message:
            self.context.set_state("process_exit_message", message)

        return ExecutionResult(
            success=(status == "pass"),
            output_port="end",
            data={"status": status, "message": message},
        )
