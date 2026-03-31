"""
RPAForge Recorder Module.

Captures user actions and converts them to Robot Framework keywords.
"""

from rpaforge.recorder.capture import EventCapture
from rpaforge.recorder.parser import ActionParser

__all__ = [
    "EventCapture",
    "ActionParser",
]
