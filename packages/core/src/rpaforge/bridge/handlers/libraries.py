"""Bridge handlers for third-party library management."""

from __future__ import annotations

import importlib.metadata
import logging
import subprocess
import sys
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger("rpaforge.bridge.handlers.libraries")


def setup_libraries_handlers(bridge_handlers_class: type) -> None:
    """Attach library management handlers to BridgeHandlers class."""

    def _handle_list_libraries(self: Any) -> dict[str, Any]:
        """List installed RPA libraries."""
        try:
            libraries = []
            entry_points = importlib.metadata.entry_points()

            # Get entry points for rpaforge.libraries group
            if hasattr(entry_points, "select"):
                # Python 3.10+
                group = entry_points.select(group="rpaforge.libraries")  # type: ignore[attr-defined]
            else:
                # Python 3.9
                group = entry_points.get("rpaforge.libraries") or []  # type: ignore[assignment,union-attr]

            for ep in group:
                try:
                    # Get package metadata
                    dist = importlib.metadata.distribution(ep.value.split(".")[0])

                    # Load library class to get activities count
                    lib_class = ep.load()
                    instance = lib_class()

                    # Count activities (methods decorated with @activity)
                    activities_count = sum(
                        1 for attr in dir(instance)
                        if not attr.startswith("_") and
                        hasattr(getattr(instance, attr), "__wrapped__")
                    )

                    libraries.append({
                        "name": ep.name,
                        "version": dist.version,
                        "description": dist.metadata.get("Summary", ""),
                        "activitiesCount": activities_count,
                        "author": dist.metadata.get("Author", ""),
                    })
                except Exception as e:
                    logger.warning(f"Failed to load library {ep.name}: {e}")
                    continue

            return {"libraries": libraries}
        except Exception as e:
            logger.error(f"Failed to list libraries: {e}")
            raise

    def _handle_install_library(self: Any, params: dict[str, Any]) -> dict[str, Any]:
        """Install a library via pip."""
        pypi_package = params.get("pypiPackage")
        if not pypi_package:
            raise ValueError("pypiPackage parameter required")

        try:
            # Run pip install with --no-deps to avoid installing unnecessary dependencies
            # User can review dependencies before confirming
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--no-deps", pypi_package],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout
                logger.error(f"Failed to install {pypi_package}: {error_msg}")
                return {"success": False, "message": f"Installation failed: {error_msg}"}

            logger.info(f"Successfully installed {pypi_package}")
            return {"success": True, "message": f"{pypi_package} installed successfully"}
        except subprocess.TimeoutExpired:
            return {"success": False, "message": "Installation timeout (exceeded 5 minutes)"}
        except Exception as e:
            logger.error(f"Error installing {pypi_package}: {e}")
            return {"success": False, "message": str(e)}

    def _handle_uninstall_library(self: Any, params: dict[str, Any]) -> dict[str, Any]:
        """Uninstall a library via pip."""
        pypi_package = params.get("pypiPackage")
        if not pypi_package:
            raise ValueError("pypiPackage parameter required")

        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "uninstall", "-y", pypi_package],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout
                logger.error(f"Failed to uninstall {pypi_package}: {error_msg}")
                return {"success": False, "message": f"Uninstall failed: {error_msg}"}

            logger.info(f"Successfully uninstalled {pypi_package}")
            return {"success": True, "message": f"{pypi_package} uninstalled successfully"}
        except subprocess.TimeoutExpired:
            return {"success": False, "message": "Uninstall timeout (exceeded 5 minutes)"}
        except Exception as e:
            logger.error(f"Error uninstalling {pypi_package}: {e}")
            return {"success": False, "message": str(e)}

    def _handle_refresh_libraries(self: Any, params: dict[str, Any]) -> dict[str, Any]:
        """Refresh library discovery after installation/uninstallation."""
        try:
            # Re-register all discovered libraries
            from rpaforge.core.activity import discover_libraries

            for lib_name, lib_class in discover_libraries():
                try:
                    self._engine.executor.register_library(lib_name, lib_class())
                except Exception:
                    logger.exception(f"Failed to register {lib_name}")

            logger.info("Libraries refreshed successfully")
            return {"success": True, "message": "Libraries refreshed successfully"}
        except Exception as e:
            logger.error(f"Error refreshing libraries: {e}")
            return {"success": False, "message": str(e)}

    # Attach methods to BridgeHandlers
    bridge_handlers_class._handle_list_libraries = _handle_list_libraries
    bridge_handlers_class._handle_install_library = _handle_install_library
    bridge_handlers_class._handle_uninstall_library = _handle_uninstall_library
    bridge_handlers_class._handle_refresh_libraries = _handle_refresh_libraries
