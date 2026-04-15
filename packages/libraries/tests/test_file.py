"""Tests for RPAForge File Library."""

import tempfile
from pathlib import Path

import pytest

from rpaforge_libraries.File import File


class TestFileLibrary:
    """Tests for File library."""

    def setup_method(self):
        """Set up test fixtures."""
        self.library = File()
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """Clean up test fixtures."""
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_create_file(self):
        """Test creating a new file."""
        path = Path(self.temp_dir) / "test.txt"
        result = self.library.create_file(str(path), "Hello World")
        assert Path(result).exists()
        assert Path(result).read_text() == "Hello World"

    def test_create_file_overwrite(self):
        """Test overwriting an existing file."""
        path = Path(self.temp_dir) / "test.txt"
        self.library.create_file(str(path), "Original")
        result = self.library.create_file(str(path), "New", overwrite=True)
        assert Path(result).read_text() == "New"

    def test_create_file_no_overwrite_raises(self):
        """Test that creating existing file without overwrite raises error."""
        path = Path(self.temp_dir) / "test.txt"
        self.library.create_file(str(path), "Original")
        with pytest.raises(FileExistsError):
            self.library.create_file(str(path), "New", overwrite=False)

    def test_read_file(self):
        """Test reading a file."""
        path = Path(self.temp_dir) / "test.txt"
        path.write_text("Hello World")
        result = self.library.read_file(str(path))
        assert result == "Hello World"

    def test_read_file_not_found_raises(self):
        """Test reading non-existent file raises error."""
        with pytest.raises(FileNotFoundError):
            self.library.read_file("/nonexistent/file.txt")

    def test_write_file(self):
        """Test writing to a file."""
        path = Path(self.temp_dir) / "test.txt"
        result = self.library.write_file(str(path), "Hello")
        assert Path(result).read_text() == "Hello"

    def test_write_file_append(self):
        """Test appending to a file."""
        path = Path(self.temp_dir) / "test.txt"
        self.library.write_file(str(path), "Hello")
        self.library.write_file(str(path), " World", append=True)
        assert path.read_text() == "Hello World"

    def test_delete_file(self):
        """Test deleting a file."""
        path = Path(self.temp_dir) / "test.txt"
        path.write_text("test")
        result = self.library.delete_file(str(path))
        assert result is True
        assert not path.exists()

    def test_delete_file_missing_ok(self):
        """Test deleting non-existent file with missing_ok."""
        result = self.library.delete_file("/nonexistent/file.txt", missing_ok=True)
        assert result is False

    def test_copy_file(self):
        """Test copying a file."""
        src = Path(self.temp_dir) / "source.txt"
        dst = Path(self.temp_dir) / "dest.txt"
        src.write_text("test content")
        result = self.library.copy_file(str(src), str(dst))
        assert Path(result).read_text() == "test content"

    def test_move_file(self):
        """Test moving a file."""
        src = Path(self.temp_dir) / "source.txt"
        dst = Path(self.temp_dir) / "dest.txt"
        src.write_text("test content")
        result = self.library.move_file(str(src), str(dst))
        assert Path(result).read_text() == "test content"
        assert not src.exists()

    def test_file_exists(self):
        """Test file existence check."""
        path = Path(self.temp_dir) / "test.txt"
        assert not self.library.path_exists(str(path), "file")
        path.write_text("test")
        assert self.library.path_exists(str(path), "file")

    def test_get_file_info(self):
        """Test getting file info."""
        path = Path(self.temp_dir) / "test.txt"
        path.write_text("test content")
        info = self.library.get_file_info(str(path))
        assert info["name"] == "test.txt"
        assert info["size_bytes"] == 12
        assert info["extension"] == ".txt"

    def test_list_files(self):
        """Test listing files in a directory."""
        (Path(self.temp_dir) / "file1.txt").write_text("1")
        (Path(self.temp_dir) / "file2.txt").write_text("2")
        (Path(self.temp_dir) / "file3.log").write_text("3")
        files = self.library.list_files(self.temp_dir, "*.txt")
        assert len(files) == 2

    def test_create_directory(self):
        """Test creating a directory."""
        path = Path(self.temp_dir) / "subdir" / "nested"
        result = self.library.create_directory(str(path))
        assert Path(result).exists()
        assert Path(result).is_dir()

    def test_delete_directory(self):
        """Test deleting a directory."""
        path = Path(self.temp_dir) / "subdir"
        path.mkdir()
        result = self.library.delete_directory(str(path))
        assert result is True
        assert not path.exists()

    def test_directory_exists(self):
        """Test checking if a directory exists."""
        path = Path(self.temp_dir) / "subdir"
        path.mkdir()
        assert self.library.path_exists(str(path), "directory") is True
        assert self.library.path_exists(str(path), "file") is False

    def test_get_file_name(self):
        """Test extracting file name."""
        assert self.library.get_path_part("/path/to/file.txt", "name") == "file.txt"
        assert self.library.get_path_part("/path/to/file.txt", "stem") == "file"

    def test_get_file_extension(self):
        """Test extracting file extension."""
        assert self.library.get_path_part("/path/to/file.txt", "extension") == ".txt"
        assert self.library.get_path_part("/path/to/file.tar.gz", "extension") == ".gz"

    def test_combine_paths(self):
        """Test combining paths."""
        result = self.library.combine_paths("/path", "to", "file.txt")
        assert "path" in result
        assert "to" in result
        assert "file.txt" in result

    def test_read_lines(self):
        """Test reading file as lines."""
        path = Path(self.temp_dir) / "test.txt"
        path.write_text("line1\nline2\nline3")
        lines = self.library.read_file(str(path), as_lines=True)
        assert lines == ["line1", "line2", "line3"]

    def test_write_lines(self):
        """Test writing lines to file."""
        path = Path(self.temp_dir) / "test.txt"
        self.library.write_file(str(path), ["line1", "line2", "line3"])
        lines = path.read_text().strip().split("\n")
        assert lines == ["line1", "line2", "line3"]

    def test_rename_file(self):
        """Test renaming a file."""
        path = Path(self.temp_dir) / "old.txt"
        path.write_text("content")
        result = self.library.rename_file(str(path), "new.txt")
        assert Path(result).name == "new.txt"
        assert not path.exists()
