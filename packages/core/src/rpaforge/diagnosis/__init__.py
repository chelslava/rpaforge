"""AI failure diagnosis: redacted bundles, LLM engine, artifacts (issue #906).

Live mode (Studio) calls the provider from Electron main; batch mode
(daemon/serve dead-letter items) uses :func:`diagnose_run` from Python.
Both share the same redacted bundle shape and typed fix-proposal
contract.
"""

from rpaforge.diagnosis.bundle import (
    BUNDLE_SCHEMA_VERSION,
    DEFAULT_MAX_EVENTS,
    DEFAULT_MAX_STEPS,
    build_diagnosis_bundle,
)
from rpaforge.diagnosis.engine import (
    EVENT_DIAGNOSIS_PROPOSED,
    PROPOSAL_TYPES,
    DiagnosisError,
    diagnose_run,
    load_diagnosis_artifact,
    parse_diagnosis,
    save_diagnosis_artifact,
)

__all__ = [
    "BUNDLE_SCHEMA_VERSION",
    "DEFAULT_MAX_EVENTS",
    "DEFAULT_MAX_STEPS",
    "EVENT_DIAGNOSIS_PROPOSED",
    "PROPOSAL_TYPES",
    "DiagnosisError",
    "build_diagnosis_bundle",
    "diagnose_run",
    "load_diagnosis_artifact",
    "parse_diagnosis",
    "save_diagnosis_artifact",
]
