"""Exceptions for RPAForge IDP library."""

from __future__ import annotations


class IDPError(Exception):
    """Base exception for IDP library errors."""


class IDPDependencyError(IDPError, ImportError):
    """Raised when an optional document parser dependency is missing."""


class IDPParseError(IDPError):
    """Raised when a document is empty, corrupt, or otherwise unparseable."""
