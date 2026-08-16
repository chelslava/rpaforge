"""Command-line interface for the RPAForge Headless Unattended Runner (rpaforge-runner)."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

from rpaforge.cli.run import (
    RunConfigurationError,
    RunExitCode,
    RunValidationError,
    error_payload,
    load_diagram,
)
from rpaforge.runner.daemon import RunnerDaemon, SQLiteEmbeddedQueue
from rpaforge.runner.logging import EventLogger
from rpaforge.runner.supervisor import ProcessSupervisor, SupervisorConfig
from rpaforge.runner.validator import validate_source
from rpaforge.version import __version__


def _print_payload(payload: dict[str, object], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, ensure_ascii=False))
        return
    status = payload.get("status", "unknown")
    message = payload.get("message") or payload.get("error") or ""
    print(f"Status: {status}")
    if message:
        print(message, file=sys.stderr if payload.get("error") else sys.stdout)
    if payload.get("run_id"):
        print(f"Run ID: {payload['run_id']}")
    if payload.get("audit_path"):
        print(f"Audit: {payload['audit_path']}")
    if payload.get("elapsed_ms") is not None:
        print(f"Elapsed: {payload['elapsed_ms']}ms")


def _run_command(args: argparse.Namespace) -> int:
    is_quiet = args.quiet or (args.as_json and not args.ndjson)
    event_logger = EventLogger(ndjson=args.ndjson, quiet=is_quiet)
    config = SupervisorConfig(
        timeout=args.timeout,
        max_memory_mb=args.max_memory_mb,
    )
    supervisor = ProcessSupervisor(config=config, logger=event_logger)

    try:
        loaded = load_diagram(args.source, args.diagram)
        code, payload = supervisor.execute(
            loaded,
            values=args.values,
            secret_envs=args.secret_envs,
        )
    except RunValidationError as error:
        code = RunExitCode.VALIDATION_FAILURE
        payload = error_payload("validation_error", str(error))
    except RunConfigurationError as error:
        code = RunExitCode.CONFIGURATION_ERROR
        payload = error_payload("configuration_error", str(error))
    except Exception as error:
        code = RunExitCode.EXECUTION_FAILURE
        payload = error_payload("execution_error", str(error))

    if not args.ndjson or args.as_json:
        _print_payload(payload, args.as_json)
    return int(code)


def _validate_command(args: argparse.Namespace) -> int:
    report = validate_source(args.source, args.diagram)
    if args.as_json:
        print(
            json.dumps(
                report.to_dict(),
                indent=2 if not args.quiet else None,
                ensure_ascii=False,
            )
        )
    else:
        if report.is_valid:
            print(f"VALID: {report.source_path}")
            print(f"Process: {report.process_name}")
            print(
                f"Stats: {report.node_count} nodes, {report.edge_count} edges, "
                f"{report.variable_count} variables, {len(report.activities)} activities"
            )
            if report.warnings:
                print("\nWarnings:")
                for w in report.warnings:
                    print(f"  - {w}")
        else:
            print(f"INVALID: {report.source_path}", file=sys.stderr)
            print("\nErrors:", file=sys.stderr)
            for err in report.errors:
                print(f"  - {err}", file=sys.stderr)
            if report.warnings:
                print("\nWarnings:")
                for w in report.warnings:
                    print(f"  - {w}")

    return 0 if report.is_valid else 2


def _daemon_command(args: argparse.Namespace) -> int:
    event_logger = EventLogger(ndjson=args.ndjson, quiet=args.quiet)
    supervisor_config = SupervisorConfig(
        max_memory_mb=args.max_memory_mb,
    )
    backend = (
        SQLiteEmbeddedQueue(db_path=args.db_path)
        if args.db_path
        else SQLiteEmbeddedQueue()
    )
    daemon = RunnerDaemon(
        queue_name=args.queue,
        backend=backend,
        concurrency=args.concurrency,
        poll_interval=args.poll_interval,
        supervisor_config=supervisor_config,
        logger=event_logger,
        max_tasks=args.max_tasks,
    )
    return daemon.run()


def _version_command(args: argparse.Namespace) -> int:
    info = {
        "runner_version": __version__,
        "engine": "RPAForge Native Core",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    }
    if args.as_json:
        print(json.dumps(info, ensure_ascii=False))
    else:
        print(f"rpaforge-runner v{__version__} (Python {info['python']})")
    return 0


def create_parser() -> argparse.ArgumentParser:
    """Construct the CLI argument parser for rpaforge-runner."""
    parser = argparse.ArgumentParser(
        prog="rpaforge-runner",
        description="RPAForge Headless Unattended Robot Runner & Daemon",
    )
    subparsers = parser.add_subparsers(dest="command", required=False)

    # Subcommand: run
    run_parser = subparsers.add_parser(
        "run", help="Execute a process or project headlessly"
    )
    run_parser.add_argument(
        "source", help="Path to a .process, .forge, .rpaforge, or project directory"
    )
    run_parser.add_argument(
        "--diagram", help="Diagram ID, name, or path for project inputs"
    )
    run_parser.add_argument(
        "--var", dest="values", action="append", default=[], metavar="NAME=VALUE"
    )
    run_parser.add_argument(
        "--secret-env",
        dest="secret_envs",
        action="append",
        default=[],
        metavar="NAME=ENV",
        help="Read a secret variable from an environment variable",
    )
    run_parser.add_argument(
        "--timeout", type=float, help="Cancel execution after this many seconds"
    )
    run_parser.add_argument(
        "--max-memory-mb", type=int, help="Enforce maximum RSS memory limit in MB"
    )
    run_parser.add_argument(
        "--json",
        dest="as_json",
        action="store_true",
        help="Print structured JSON result",
    )
    run_parser.add_argument(
        "--ndjson",
        action="store_true",
        help="Stream real-time events as Newline Delimited JSON",
    )
    run_parser.add_argument(
        "-q", "--quiet", action="store_true", help="Suppress progress output"
    )

    # Subcommand: validate
    val_parser = subparsers.add_parser(
        "validate", help="Statically validate a diagram without running"
    )
    val_parser.add_argument(
        "source", help="Path to a .process, .forge, .rpaforge, or project directory"
    )
    val_parser.add_argument(
        "--diagram", help="Diagram ID, name, or path for project inputs"
    )
    val_parser.add_argument(
        "--json",
        dest="as_json",
        action="store_true",
        help="Output validation report as JSON",
    )
    val_parser.add_argument("-q", "--quiet", action="store_true", help="Minimal output")

    # Subcommand: daemon
    daemon_parser = subparsers.add_parser(
        "daemon", help="Run background worker daemon polling a work queue"
    )
    daemon_parser.add_argument(
        "--queue", required=True, help="Name of work queue to poll"
    )
    daemon_parser.add_argument(
        "--concurrency", type=int, default=1, help="Number of concurrent worker threads"
    )
    daemon_parser.add_argument(
        "--poll-interval", type=float, default=2.0, help="Polling interval in seconds"
    )
    daemon_parser.add_argument(
        "--max-tasks", type=int, help="Exit gracefully after processing N tasks"
    )
    daemon_parser.add_argument(
        "--max-memory-mb", type=int, help="Enforce memory quota in MB"
    )
    daemon_parser.add_argument("--db-path", help="Path to SQLite queue database")
    daemon_parser.add_argument(
        "--ndjson", action="store_true", help="Stream daemon events in NDJSON"
    )
    daemon_parser.add_argument(
        "-q", "--quiet", action="store_true", help="Quiet daemon mode"
    )

    # Subcommand: pack
    pack_parser = subparsers.add_parser(
        "pack",
        help="Bundle a project into a self-contained .forge distribution package",
    )
    pack_parser.add_argument(
        "source", help="Path to project directory containing .rpaforge or diagrams"
    )
    pack_parser.add_argument(
        "-o", "--output", required=True, help="Output .forge file path"
    )
    pack_parser.add_argument(
        "--no-validate", action="store_true", help="Skip pre-flight diagram validation"
    )
    pack_parser.add_argument(
        "--json", dest="as_json", action="store_true", help="Print result as JSON"
    )

    # Subcommand: version
    ver_parser = subparsers.add_parser(
        "version", help="Print runner and engine version"
    )
    ver_parser.add_argument(
        "--json", dest="as_json", action="store_true", help="Print version as JSON"
    )

    return parser


def _pack_command(args: argparse.Namespace) -> int:
    from rpaforge.packaging import ForgePackageBuilder, ForgePackageValidationError

    builder = ForgePackageBuilder(validate_diagrams=not args.no_validate)
    try:
        output = builder.build_from_directory(args.source, args.output)
        if args.as_json:
            print(json.dumps({"status": "SUCCESS", "package_path": str(output)}))
        else:
            print(f"Created package: {output}")
        return 0
    except ForgePackageValidationError as error:
        if args.as_json:
            print(json.dumps({"status": "ERROR", "error": str(error)}))
        else:
            print(f"Packaging validation error: {error}", file=sys.stderr)
        return int(RunExitCode.VALIDATION_FAILURE)
    except Exception as error:
        if args.as_json:
            print(json.dumps({"status": "ERROR", "error": str(error)}))
        else:
            print(f"Failed to create package: {error}", file=sys.stderr)
        return int(RunExitCode.EXECUTION_FAILURE)


def main(argv: Sequence[str] | None = None) -> int:
    """Main CLI entrypoint."""
    parser = create_parser()
    args = parser.parse_args(argv)

    if args.command == "run":
        return _run_command(args)
    if args.command == "validate":
        return _validate_command(args)
    if args.command == "daemon":
        return _daemon_command(args)
    if args.command == "pack":
        return _pack_command(args)
    if args.command == "version":
        return _version_command(args)

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
