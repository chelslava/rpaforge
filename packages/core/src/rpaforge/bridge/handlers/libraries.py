"""Bridge handlers for third-party library management."""

from __future__ import annotations

import importlib
import importlib.metadata
import logging
import subprocess
import sys
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.bridge.handlers.libraries")

# Core packages that ship with RPAForge — these must not be uninstallable
# from within the Studio UI because uninstalling them removes ALL built-in
# libraries at once (they share a single Python package).
_CORE_PACKAGES = frozenset({"rpaforge-libraries", "rpaforge-core"})


def setup_libraries_handlers(bridge_handlers_class: type) -> None:
    """Attach library management handlers to BridgeHandlers class."""

    def _handle_list_libraries(
        self: Any, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
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
                    pypi_package = dist.metadata.get("Name", ep.name)

                    # Load library class to get activities count
                    lib_class = ep.load()
                    instance = lib_class()

                    # Count activities (methods decorated with @activity)
                    activities_count = sum(
                        1
                        for attr in dir(instance)
                        if not attr.startswith("_")
                        and hasattr(getattr(instance, attr), "__wrapped__")
                    )

                    libraries.append(
                        {
                            "name": ep.name,
                            "pypiPackage": pypi_package,
                            "version": dist.version,
                            "description": dist.metadata.get("Summary", ""),
                            "activitiesCount": activities_count,
                            "author": dist.metadata.get("Author", ""),
                            "builtin": pypi_package in _CORE_PACKAGES,
                        }
                    )
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
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", pypi_package],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout
                logger.error(f"Failed to install {pypi_package}: {error_msg}")
                return {
                    "success": False,
                    "message": f"Installation failed: {error_msg}",
                }

            importlib.invalidate_caches()
            logger.info(f"Successfully installed {pypi_package}")
            return {
                "success": True,
                "message": f"{pypi_package} installed successfully",
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "message": "Installation timeout (exceeded 5 minutes)",
            }
        except Exception as e:
            logger.error(f"Error installing {pypi_package}: {e}")
            return {"success": False, "message": str(e)}

    def _handle_update_library(self: Any, params: dict[str, Any]) -> dict[str, Any]:
        """Update a library to the latest version via pip."""
        pypi_package = params.get("pypiPackage")
        if not pypi_package:
            raise ValueError("pypiPackage parameter required")

        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--upgrade", pypi_package],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout
                logger.error(f"Failed to update {pypi_package}: {error_msg}")
                return {
                    "success": False,
                    "message": f"Update failed: {error_msg}",
                }

            importlib.invalidate_caches()
            logger.info(f"Successfully updated {pypi_package}")
            return {
                "success": True,
                "message": f"{pypi_package} updated successfully",
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "message": "Update timeout (exceeded 5 minutes)",
            }
        except Exception as e:
            logger.error(f"Error updating {pypi_package}: {e}")
            return {"success": False, "message": str(e)}

    def _handle_uninstall_library(self: Any, params: dict[str, Any]) -> dict[str, Any]:
        """Uninstall a library via pip."""
        pypi_package = params.get("pypiPackage")
        if not pypi_package:
            raise ValueError("pypiPackage parameter required")

        # Prevent uninstalling core packages — doing so would remove ALL
        # built-in libraries at once (they share a single Python package).
        if pypi_package in _CORE_PACKAGES:
            return {
                "success": False,
                "message": f"Cannot uninstall '{pypi_package}': it is a core package. "
                f"To remove built-in libraries, uninstall 'rpaforge-libraries' via pip directly.",
            }

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

            importlib.invalidate_caches()
            logger.info(f"Successfully uninstalled {pypi_package}")
            return {
                "success": True,
                "message": f"{pypi_package} uninstalled successfully",
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "message": "Uninstall timeout (exceeded 5 minutes)",
            }
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
    bridge_handlers_class._handle_update_library = _handle_update_library
    bridge_handlers_class._handle_uninstall_library = _handle_uninstall_library
    bridge_handlers_class._handle_refresh_libraries = _handle_refresh_libraries
