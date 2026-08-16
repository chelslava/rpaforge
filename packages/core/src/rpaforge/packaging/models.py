"""Data models for RPAForge .forge distribution package format."""

from __future__ import annotations

import datetime
from dataclasses import asdict, dataclass, field
from typing import Any

from rpaforge.version import __version__


@dataclass
class ForgePackageManifest:
    """Metadata describing a .forge distribution package."""

    name: str
    version: str = "1.0.0"
    entry_diagram: str = "diagrams/main.json"
    engine_version: str = __version__
    author: str = ""
    description: str = ""
    created_at: str = field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    dependencies: dict[str, str] = field(default_factory=dict)
    file_checksums: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ForgePackageManifest:
        return cls(
            name=data.get("name", "unnamed-project"),
            version=data.get("version", "1.0.0"),
            entry_diagram=data.get("entry_diagram", "diagrams/main.json"),
            engine_version=data.get("engine_version", __version__),
            author=data.get("author", ""),
            description=data.get("description", ""),
            created_at=data.get(
                "created_at",
                datetime.datetime.now(datetime.timezone.utc).isoformat(),
            ),
            dependencies=data.get("dependencies", {}),
            file_checksums=data.get("file_checksums", {}),
        )
