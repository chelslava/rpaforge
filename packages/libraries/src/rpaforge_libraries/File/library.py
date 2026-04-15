"""RPAForge File Library - File system operations."""

from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, param, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.file")


@library(name="File", category="System", icon="📁")
class File:
    """File system operations library."""

    @activity(name="Create File", category="File")
    @tags("file", "create")
    @output("Absolute path to the created file")
    def create_file(
        self,
        path: str | Path,
        content: str = "",
        encoding: str = "utf-8",
        overwrite: bool = False,
    ) -> str:
        """Create a new file with optional content.

        :param path: Path to the file to create.
        :param content: Initial content to write to the file.
        :param encoding: File encoding (default: utf-8).
        :param overwrite: Whether to overwrite existing file.
        :returns: Absolute path to the created file.
        :raises FileExistsError: If file exists and overwrite is False.
        """
        file_path = Path(path).resolve()
        if file_path.exists() and not overwrite:
            raise FileExistsError(f"File already exists: {file_path}")

        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding=encoding)
        logger.info(f"Created file: {file_path}")
        return str(file_path)

    @activity(name="Read File", category="File")
    @tags("file", "read")
    @output("File content as string or list of lines")
    def read_file(
        self,
        path: str | Path,
        encoding: str = "utf-8",
        as_lines: bool = False,
        strip_lines: bool = True,
        skip_empty: bool = False,
    ) -> str | list[str]:
        """Read the content of a file.

        :param path: Path to the file to read.
        :param encoding: File encoding (default: utf-8).
        :param as_lines: Return as list of lines instead of string.
        :param strip_lines: Strip whitespace from each line (only when as_lines=True).
        :param skip_empty: Skip empty lines (only when as_lines=True).
        :returns: File content as string or list of lines.
        :raises FileNotFoundError: If file does not exist.
        """
        file_path = Path(path).resolve()
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        content = file_path.read_text(encoding=encoding)

        if as_lines:
            lines = content.splitlines()
            if strip_lines:
                lines = [line.strip() for line in lines]
            if skip_empty:
                lines = [line for line in lines if line]
            logger.info(f"Read {len(lines)} lines from: {file_path}")
            return lines

        logger.info(f"Read file: {file_path} ({len(content)} chars)")
        return content

    @activity(name="Write File", category="File")
    @tags("file", "write")
    @output("Absolute path to the written file")
    def write_file(
        self,
        path: str | Path,
        content: str | list[str],
        encoding: str = "utf-8",
        append: bool = False,
    ) -> str:
        """Write content to a file.

        :param path: Path to the file to write.
        :param content: Content to write - string or list of lines.
        :param encoding: File encoding (default: utf-8).
        :param append: Whether to append to existing file.
        :returns: Absolute path to the written file.
        """
        file_path = Path(path).resolve()
        file_path.parent.mkdir(parents=True, exist_ok=True)

        if isinstance(content, list):
            text = "\n".join(content)
            if text:
                text += "\n"
        else:
            text = content

        mode = "a" if append else "w"
        with open(file_path, mode, encoding=encoding) as f:
            f.write(text)

        count = len(content) if isinstance(content, list) else len(text)
        logger.info(
            f"Wrote file: {file_path} ({count} {'lines' if isinstance(content, list) else 'chars'})"
        )
        return str(file_path)

    @activity(name="Delete File", category="File")
    @tags("file", "delete")
    @output("True if file was deleted, False if it didn't exist")
    def delete_file(
        self,
        path: str | Path,
        missing_ok: bool = True,
    ) -> bool:
        """Delete a file.

        :param path: Path to the file to delete.
        :param missing_ok: Whether to ignore if file doesn't exist.
        :returns: True if file was deleted, False if it didn't exist.
        :raises FileNotFoundError: If file doesn't exist and missing_ok is False.
        """
        file_path = Path(path).resolve()
        if not file_path.exists():
            if missing_ok:
                logger.info(f"File not found (ignored): {file_path}")
                return False
            raise FileNotFoundError(f"File not found: {file_path}")

        file_path.unlink()
        logger.info(f"Deleted file: {file_path}")
        return True

    @activity(name="Copy File", category="File")
    @tags("file", "copy")
    @output("Absolute path to the copied file")
    def copy_file(
        self,
        source: str | Path,
        destination: str | Path,
        overwrite: bool = True,
    ) -> str:
        """Copy a file to a new location.

        :param source: Path to the source file.
        :param destination: Path to the destination file or directory.
        :param overwrite: Whether to overwrite existing destination.
        :returns: Absolute path to the copied file.
        :raises FileNotFoundError: If source file doesn't exist.
        :raises FileExistsError: If destination exists and overwrite is False.
        """
        src_path = Path(source).resolve()
        if not src_path.exists():
            raise FileNotFoundError(f"Source file not found: {src_path}")

        dst_path = Path(destination).resolve()
        if dst_path.is_dir():
            dst_path = dst_path / src_path.name

        if dst_path.exists() and not overwrite:
            raise FileExistsError(f"Destination already exists: {dst_path}")

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)
        logger.info(f"Copied file: {src_path} -> {dst_path}")
        return str(dst_path)

    @activity(name="Move File", category="File")
    @tags("file", "move")
    @output("Absolute path to the moved file")
    def move_file(
        self,
        source: str | Path,
        destination: str | Path,
        overwrite: bool = True,
    ) -> str:
        """Move a file to a new location.

        :param source: Path to the source file.
        :param destination: Path to the destination file or directory.
        :param overwrite: Whether to overwrite existing destination.
        :returns: Absolute path to the moved file.
        :raises FileNotFoundError: If source file doesn't exist.
        :raises FileExistsError: If destination exists and overwrite is False.
        """
        src_path = Path(source).resolve()
        if not src_path.exists():
            raise FileNotFoundError(f"Source file not found: {src_path}")

        dst_path = Path(destination).resolve()
        if dst_path.is_dir():
            dst_path = dst_path / src_path.name

        if dst_path.exists():
            if not overwrite:
                raise FileExistsError(f"Destination already exists: {dst_path}")
            dst_path.unlink()

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src_path), str(dst_path))
        logger.info(f"Moved file: {src_path} -> {dst_path}")
        return str(dst_path)

    @activity(name="Path Exists", category="File")
    @tags("file", "directory", "check")
    @output("True if path exists, False otherwise")
    def path_exists(
        self,
        path: str | Path,
        path_type: str = "any",
    ) -> bool:
        """Check if a path exists.

        :param path: Path to check.
        :param path_type: Type to check - 'file', 'directory', or 'any'.
        :returns: True if path exists and matches type, False otherwise.
        """
        file_path = Path(path).resolve()
        path_type = path_type.lower()

        if path_type == "file":
            exists = file_path.exists() and file_path.is_file()
        elif path_type == "directory":
            exists = file_path.exists() and file_path.is_dir()
        else:
            exists = file_path.exists()

        logger.info(f"Path exists check ({path_type}): {file_path} = {exists}")
        return exists

    @activity(name="Get File Info", category="File")
    @tags("file", "info")
    @output("Dictionary with file information")
    def get_file_info(
        self,
        path: str | Path,
    ) -> dict[str, Any]:
        """Get detailed information about a file.

        :param path: Path to the file.
        :returns: Dictionary with file information.
        :raises FileNotFoundError: If file doesn't exist.
        """
        file_path = Path(path).resolve()
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        stat = file_path.stat()
        info = {
            "path": str(file_path),
            "name": file_path.name,
            "stem": file_path.stem,
            "extension": file_path.suffix,
            "size_bytes": stat.st_size,
            "size_kb": round(stat.st_size / 1024, 2),
            "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "accessed": datetime.fromtimestamp(stat.st_atime).isoformat(),
            "is_readonly": not os.access(file_path, os.W_OK),
            "is_hidden": file_path.name.startswith("."),
        }
        logger.info(f"Got file info: {file_path}")
        return info

    @activity(name="List Files", category="File")
    @tags("file", "list", "directory")
    @output("List of file paths matching the pattern")
    def list_files(
        self,
        directory: str | Path,
        pattern: str = "*",
        recursive: bool = False,
    ) -> list[str]:
        """List files in a directory.

        :param directory: Path to the directory.
        :param pattern: Glob pattern to filter files (default: *).
        :param recursive: Whether to search recursively.
        :returns: List of file paths matching the pattern.
        :raises FileNotFoundError: If directory doesn't exist.
        """
        dir_path = Path(directory).resolve()
        if not dir_path.exists():
            raise FileNotFoundError(f"Directory not found: {dir_path}")
        if not dir_path.is_dir():
            raise NotADirectoryError(f"Not a directory: {dir_path}")

        if recursive:
            files = list(dir_path.rglob(pattern))
        else:
            files = list(dir_path.glob(pattern))

        file_paths = [str(f) for f in files if f.is_file()]
        logger.info(f"Listed {len(file_paths)} files in: {dir_path}")
        return file_paths

    @activity(name="Create Directory", category="File")
    @tags("directory", "create")
    @output("Absolute path to the created directory")
    def create_directory(
        self,
        path: str | Path,
        exist_ok: bool = True,
    ) -> str:
        """Create a directory.

        :param path: Path to the directory to create.
        :param exist_ok: Whether to ignore if directory already exists.
        :returns: Absolute path to the created directory.
        :raises FileExistsError: If directory exists and exist_ok is False.
        """
        dir_path = Path(path).resolve()
        dir_path.mkdir(parents=True, exist_ok=exist_ok)
        logger.info(f"Created directory: {dir_path}")
        return str(dir_path)

    @activity(name="Delete Directory", category="File")
    @tags("directory", "delete")
    @output("True if directory was deleted, False if it didn't exist")
    def delete_directory(
        self,
        path: str | Path,
        recursive: bool = False,
        missing_ok: bool = True,
    ) -> bool:
        """Delete a directory.

        :param path: Path to the directory to delete.
        :param recursive: Whether to delete non-empty directories.
        :param missing_ok: Whether to ignore if directory doesn't exist.
        :returns: True if directory was deleted, False if it didn't exist.
        :raises FileNotFoundError: If directory doesn't exist and missing_ok is False.
        :raises OSError: If directory is not empty and recursive is False.
        """
        dir_path = Path(path).resolve()
        if not dir_path.exists():
            if missing_ok:
                logger.info(f"Directory not found (ignored): {dir_path}")
                return False
            raise FileNotFoundError(f"Directory not found: {dir_path}")

        if recursive:
            shutil.rmtree(dir_path)
        else:
            dir_path.rmdir()

        logger.info(f"Deleted directory: {dir_path}")
        return True

    @activity(name="Get Current Directory", category="File")
    @tags("directory", "info")
    @output("Absolute path to current working directory")
    def get_current_directory(self) -> str:
        """Get the current working directory.

        :returns: Absolute path to current working directory.
        """
        cwd = os.getcwd()
        logger.info(f"Current directory: {cwd}")
        return cwd

    @activity(name="Set Current Directory", category="File")
    @tags("directory", "navigation")
    @output("The new current working directory")
    def set_current_directory(
        self,
        path: str | Path,
    ) -> str:
        """Change the current working directory.

        :param path: Path to set as current directory.
        :returns: The new current working directory.
        :raises FileNotFoundError: If directory doesn't exist.
        """
        dir_path = Path(path).resolve()
        if not dir_path.exists():
            raise FileNotFoundError(f"Directory not found: {dir_path}")
        if not dir_path.is_dir():
            raise NotADirectoryError(f"Not a directory: {dir_path}")

        os.chdir(dir_path)
        logger.info(f"Changed directory to: {dir_path}")
        return str(dir_path)

    @activity(name="Combine Paths", category="File")
    @tags("file", "path", "combine")
    @output("Combined path")
    def combine_paths(
        self,
        *paths: str | Path,
    ) -> str:
        """Combine multiple path segments into a single path.

        :param paths: Path segments to combine.
        :returns: Combined path.
        """
        if not paths:
            return ""
        result = Path(paths[0])
        for p in paths[1:]:
            result = result / p
        return str(result.resolve())

    @activity(name="Get Absolute Path", category="File")
    @tags("file", "path", "info")
    @output("Absolute path")
    def get_absolute_path(
        self,
        path: str | Path,
    ) -> str:
        """Convert a relative path to an absolute path.

        :param path: Relative or absolute path.
        :returns: Absolute path.
        """
        return str(Path(path).resolve())

    @activity(name="Rename File", category="File")
    @tags("file", "rename")
    @output("Absolute path to the renamed file")
    def rename_file(
        self,
        source: str | Path,
        new_name: str,
    ) -> str:
        """Rename a file in the same directory.

        :param source: Path to the source file.
        :param new_name: New file name (not path, just the name).
        :returns: Absolute path to the renamed file.
        :raises FileNotFoundError: If source file doesn't exist.
        """
        src_path = Path(source).resolve()
        if not src_path.exists():
            raise FileNotFoundError(f"Source file not found: {src_path}")

        dst_path = src_path.parent / new_name
        src_path.rename(dst_path)
        logger.info(f"Renamed file: {src_path} -> {dst_path}")
        return str(dst_path)

    @activity(name="Get Path Part", category="File")
    @tags("file", "path", "info")
    @output("The extracted path part")
    @param(
        "part",
        type="string",
        options=["name", "stem", "extension", "parent", "directory"],
        description="Which part to extract",
    )
    def get_path_part(
        self,
        path: str | Path,
        part: str = "name",
    ) -> str:
        """Extract a part from a file path.

        :param path: File path.
        :param part: Which part to extract.
        :returns: The extracted path part.
        """
        file_path = Path(path)
        part = part.lower()

        if part == "name":
            return file_path.name
        elif part == "stem":
            return file_path.stem
        elif part == "extension":
            return file_path.suffix
        elif part in ("parent", "directory"):
            return str(file_path.parent)

        return str(file_path)
