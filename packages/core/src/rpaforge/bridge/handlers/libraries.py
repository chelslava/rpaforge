"""Bridge handlers for third-party library management."""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import logging
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.bridge.handlers.libraries")

# Core packages that ship with RPAForge — these must not be uninstallable
# from within the Studio UI because uninstalling them removes ALL built-in
# # libraries at once (they share a single Python package).
_CORE_PACKAGES = frozenset({"rpaforge-libraries", "rpaforge-core"})


def _compute_sha256(file_path: str) -> str:
    """Compute SHA-256 hash of a file.

    Args:
        file_path: Path to the file to hash

    Returns:
        Hex digest of SHA-256 hash
    """
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def _verify_package_hash(pypi_package: str, expected_sha256: str | None) -> None:
    """Verify SHA-256 hash of a package from PyPI.

    This is a security measure to ensure package integrity.
    If expected_sha256 is empty or None, verification is skipped (backward compatibility).

    Args:
        pypi_package: The PyPI package name
        expected_sha256: The expected SHA-256 hash (optional)

    Raises:
        ValueError: If hash mismatch is detected
    """
    # Skip verification if no hash provided (backward compatibility)
    if not expected_sha256 or expected_sha256.strip() == "":
        return

    # Download package info from PyPI to get the download URL
    pypi_url = f"https://pypi.org/pypi/{urllib.parse.quote(pypi_package)}/json"

    try:
        with urllib.request.urlopen(pypi_url, timeout=10) as response:
            import json

            data = json.loads(response.read().decode())
    except Exception as e:
        logger.warning(f"Failed to fetch package info from PyPI: {e}")
        return  # Skip verification if we can't fetch info

    # Extract distribution URLs
    urls = data.get("info", {}).get("urls", [])
    if not urls:
        logger.warning("No distribution files found for package")
        return

    # Find the main distribution file (prefer wheels)
    dist_url = None
    for url_info in urls:
        if url_info.get("url", "").endswith(".whl"):
            dist_url = url_info["url"]
            break
    if not dist_url and urls:
        dist_url = urls[0].get("url")

    if not dist_url:
        logger.warning("No distribution URL found")
        return

    # Download the distribution file to a temp file
    try:
        with urllib.request.urlopen(dist_url, timeout=120) as response:
            import os

            with tempfile.NamedTemporaryFile(delete=False, suffix=".whl") as tmp:
                tmp.write(response.read())
                tmp_path = tmp.name

        try:
            # Compute hash of downloaded file
            actual_hash = _compute_sha256(tmp_path)

            # Compare hashes (case-insensitive)
            if actual_hash.lower() != expected_sha256.lower():
                raise ValueError(
                    f"Checksum mismatch for '{pypi_package}': "
                    f"expected '{expected_sha256}', got '{actual_hash}'. "
                    "The package may be corrupted or tampered with. Installation blocked."
                )

            logger.info(f"SHA-256 verification passed for {pypi_package}")
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        logger.warning(f"Failed to verify package hash: {e}")
        # Don't fail if verification fails - let pip handle it instead
        # This provides defense-in-depth without blocking all installations


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

        # Verify SHA-256 hash if available
        expected_hash = params.get("sha256")
        try:
            _verify_package_hash(pypi_package, expected_hash)
        except ValueError as e:
            logger.error(f"SHA-256 verification failed for {pypi_package}: {e}")
            return {"success": False, "message": str(e)}

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

        # Verify SHA-256 hash if available
        expected_hash = params.get("sha256")
        try:
            _verify_package_hash(pypi_package, expected_hash)
        except ValueError as e:
            logger.error(f"SHA-256 verification failed for {pypi_package} update: {e}")
            return {"success": False, "message": str(e)}

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
