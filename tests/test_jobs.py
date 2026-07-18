"""OCR job lifecycle tests."""

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server import jobs
from server.models import Volume


def volume(source: str, status: str = "queued", volume_id: str = "volume-1") -> Volume:
    return Volume(id=volume_id, title="Test", series="Test", source_path=source, status=status,
                  page_count=2, processed_pages=0, cover_filename=None, current_page=0,
                  error=None, created_at="now")


class JobRegistryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await jobs.stop_all()
        jobs.ACTIVE_TASKS.clear()

    async def test_only_one_active_task_per_volume(self):
        gate = asyncio.Event()
        async def worker(_): await gate.wait()
        with patch.object(jobs, "process_volume", worker):
            item = volume("/tmp/source")
            self.assertTrue(jobs.start_volume(item))
            self.assertFalse(jobs.start_volume(item))
            gate.set()
            await asyncio.sleep(0)

    async def test_existing_complete_output_is_reconciled_without_mokuro(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "pages"; source.mkdir()
            result = jobs.output_path(source)
            result.write_text(json.dumps({"pages": [{}, {}, {}]}), encoding="utf-8")
            item = volume(str(source), "processing")
            with patch.object(jobs, "save_volume") as save:
                await jobs.process_volume(item)
            self.assertEqual(item.status, "ready")
            self.assertEqual(item.processed_pages, 3)
            save.assert_called()

    async def test_pause_is_durable_even_without_a_live_task(self):
        item = volume("/tmp/source", "queued")
        with patch.object(jobs, "get_volume", return_value=item), patch.object(jobs, "save_volume") as save:
            self.assertTrue(await jobs.pause_volume(item.id))
        self.assertEqual(item.status, "paused")
        save.assert_called_once_with(item)


class RecoveryTests(unittest.TestCase):
    def test_startup_requeues_interrupted_and_queued_volumes(self):
        interrupted = volume("/tmp/one", "processing", "one")
        queued = volume("/tmp/two", "queued", "two")
        ready = volume("/tmp/three", "ready", "three")
        with patch.object(jobs, "get_volumes", return_value=[interrupted, queued, ready]), \
             patch.object(jobs, "save_volume") as save, patch.object(jobs, "start_volume", return_value=True) as start:
            self.assertEqual(jobs.recover_interrupted(), 2)
        self.assertEqual(interrupted.status, "queued")
        self.assertEqual(start.call_count, 2)
        self.assertEqual(save.call_count, 2)


if __name__ == "__main__":
    unittest.main()
