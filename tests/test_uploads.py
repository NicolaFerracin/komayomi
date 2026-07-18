"""Upload boundary tests."""

import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from PIL import Image

from server import app


def image_bytes(color: str = "red") -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (4, 4), color).save(output, "JPEG")
    return output.getvalue()


class UploadTests(unittest.IsolatedAsyncioTestCase):
    async def test_storage_ignores_names_and_preserves_duplicate_pages(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "pages"
            source.mkdir()
            uploads = [
                UploadFile(filename="../same.jpg", file=io.BytesIO(image_bytes("red"))),
                UploadFile(filename="same.jpg", file=io.BytesIO(image_bytes("blue"))),
            ]
            pages = await app.store_uploaded_pages(uploads, source)
            self.assertEqual([page.name for page in pages], ["0001.jpg", "0002.jpg"])
            self.assertTrue(all(page.parent == source for page in pages))

    async def test_invalid_image_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root)
            upload = UploadFile(filename="fake.jpg", file=io.BytesIO(b"not an image"))
            with self.assertRaises(HTTPException) as raised:
                await app.store_uploaded_pages([upload], source)
            self.assertEqual(raised.exception.status_code, 400)

    async def test_per_image_limit_is_enforced_while_streaming(self):
        with tempfile.TemporaryDirectory() as root, patch.object(app, "MAX_IMAGE_BYTES", 4):
            upload = UploadFile(filename="large.jpg", file=io.BytesIO(b"12345"))
            with self.assertRaises(HTTPException) as raised:
                await app.store_uploaded_pages([upload], Path(root))
            self.assertEqual(raised.exception.status_code, 413)


if __name__ == "__main__":
    unittest.main()
