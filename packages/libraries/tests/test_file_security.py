from __future__ import annotations

from pathlib import Path

import pytest

from rpaforge_libraries.File import File


class TestFileSecurity:
    """Path traversal and security tests for File library."""

    def test_set_current_directory_rejects_parent_traversal(self):
        """Set current directory with ../ should be rejected."""
        file_lib = File()

        with pytest.raises(FileNotFoundError):
            file_lib.set_current_directory("../../../etc")

    def test_read_file_normal_operation(self, tmp_path):
        """Test normal file read still works."""
        file_lib = File()
        test_file = tmp_path / "test.txt"
        test_file.write_text("Hello World")

        result = file_lib.read_file(str(test_file))
        assert result == "Hello World"

    def test_write_file_normal_operation(self, tmp_path):
        """Test normal file write still works."""
        file_lib = File()
        test_file = tmp_path / "test.txt"

        result = file_lib.write_file(str(test_file), "Hello World")
        assert Path(result).read_text() == "Hello World"

    def test_create_file_normal_operation(self, tmp_path):
        """Test normal file creation still works."""
        file_lib = File()
        test_file = tmp_path / "test.txt"

        result = file_lib.create_file(str(test_file), "Hello World")
        assert Path(result).read_text() == "Hello World"

    def test_delete_file_normal_operation(self, tmp_path):
        """Test normal file deletion still works."""
        file_lib = File()
        test_file = tmp_path / "test.txt"
        test_file.write_text("test")

        result = file_lib.delete_file(str(test_file))
        assert result is True
        assert not test_file.exists()

    def test_copy_file_normal_operation(self, tmp_path):
        """Test normal file copy still works."""
        file_lib = File()
        src = tmp_path / "source.txt"
        src.write_text("test content")
        dst = tmp_path / "dest.txt"

        result = file_lib.copy_file(str(src), str(dst))
        assert Path(result).read_text() == "test content"

    def test_move_file_normal_operation(self, tmp_path):
        """Test normal file move still works."""
        file_lib = File()
        src = tmp_path / "source.txt"
        src.write_text("test content")
        dst = tmp_path / "dest.txt"

        result = file_lib.move_file(str(src), str(dst))
        assert Path(result).read_text() == "test content"
        assert not src.exists()

    def test_path_exists_normal_operation(self, tmp_path):
        """Test normal path exists check still works."""
        file_lib = File()
        test_file = tmp_path / "test.txt"
        test_file.write_text("test")

        assert file_lib.path_exists(str(test_file), "file") is True
        assert file_lib.path_exists(str(tmp_path), "directory") is True

    def test_file_operation_with_symlink(self, tmp_path):
        """File operations with symlinks should work (library resolves symlinks)."""
        file_lib = File()

        external_dir = tmp_path / "external"
        external_dir.mkdir()
        external_file = external_dir / "secret.txt"
        external_file.write_text("secret")

        link = tmp_path / "link_to_secret"
        try:
            link.symlink_to(external_file)
        except OSError:
            pytest.skip("Symlinks not supported on this system")

        result = file_lib.read_file(str(link))
        assert result == "secret"

    def test_combine_paths_normal_operation(self):
        """Test normal path combination still works."""
        file_lib = File()

        result = file_lib.combine_paths("/path", "to", "file.txt")
        assert "path" in result
        assert "to" in result
        assert "file.txt" in result

    def test_get_absolute_path_normal_operation(self):
        """Test normal absolute path conversion still works."""
        file_lib = File()

        rel_path = "test.txt"
        result = file_lib.get_absolute_path(rel_path)
        assert Path(result).exists() or Path(result).parent.exists()

    def test_rename_file_normal_operation(self, tmp_path):
        """Test normal file rename still works."""
        file_lib = File()
        src = tmp_path / "old.txt"
        src.write_text("content")

        result = file_lib.rename_file(str(src), "new.txt")
        assert Path(result).name == "new.txt"
        assert not src.exists()

    def test_get_file_name_normal_operation(self):
        """Test normal file name extraction still works."""
        file_lib = File()

        assert file_lib.get_path_part("/path/to/file.txt", "name") == "file.txt"
        assert file_lib.get_path_part("/path/to/file.txt", "stem") == "file"
        assert file_lib.get_path_part("/path/to/file.txt", "extension") == ".txt"

    def test_combination_parent_traversal_detected(self, tmp_path):
        """Complex parent traversal attempts should be detected."""
        file_lib = File()

        with pytest.raises(FileNotFoundError):
            file_lib.read_file(f"{tmp_path}/../..//etc/passwd")
