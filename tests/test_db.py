"""Database migration, backup, and identity tests."""

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server import db


class DatabaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)
        self.path = self.data / 'komayomi.db'
        self.patch_data = patch.object(db, 'DATA_DIR', self.data)
        self.patch_path = patch.object(db, 'DB_PATH', self.path)
        self.patch_data.start(); self.patch_path.start(); db.initialize()

    def tearDown(self):
        self.patch_path.stop(); self.patch_data.stop(); self.temp.cleanup()

    def test_schema_version_is_recorded(self):
        with sqlite3.connect(self.path) as connection:
            version = connection.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0]
        self.assertEqual(version, db.SCHEMA_VERSION)

    def test_restore_replaces_atomically_and_keeps_safety_copy(self):
        with db.connection() as connection:
            connection.execute("INSERT INTO saved_items (id,text,created_at) VALUES ('before','before','now')")
        backup = self.data / 'chosen.db'; db.create_backup(backup)
        with db.connection() as connection:
            connection.execute("INSERT INTO saved_items (id,text,created_at) VALUES ('after','after','now')")
        safety = self.data / 'safety.db'; db.restore_backup(backup, safety)
        with db.connection() as connection:
            ids = [row[0] for row in connection.execute('SELECT id FROM saved_items')]
        self.assertEqual(ids, ['before'])
        db.validate_backup(safety)

    def test_invalid_file_is_rejected_without_touching_database(self):
        invalid = self.data / 'invalid.db'; invalid.write_text('not sqlite')
        with self.assertRaises(ValueError): db.restore_backup(invalid, self.data / 'unused.db')
        with sqlite3.connect(self.path) as connection:
            self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_volume_source_lookup_prevents_duplicate_local_imports(self):
        with db.connection() as connection:
            connection.execute("INSERT INTO volumes (id,title,series,source_path,status,page_count,processed_pages,cover_filename,current_page,error,created_at) VALUES ('v1','Volume','Series','/manga/volume','ready',1,1,NULL,0,NULL,'now')")
        self.assertEqual(db.get_volume_by_source('/manga/volume').id, 'v1')
        self.assertIsNone(db.get_volume_by_source('/manga/other'))

    def test_volume_content_fingerprint_finds_duplicate_uploads(self):
        with db.connection() as connection:
            connection.execute("INSERT INTO volumes (id,title,series,source_path,status,page_count,processed_pages,current_page,created_at,content_fingerprint) VALUES ('v2','Volume','Series','/upload','ready',1,1,0,'now','same-pages')")
        self.assertEqual(db.get_volume_by_fingerprint('same-pages').id, 'v2')
        self.assertIsNone(db.get_volume_by_fingerprint('different-pages'))


if __name__ == '__main__': unittest.main()
