from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class Volume:
    id: str
    title: str
    series: str
    source_path: str
    status: str
    page_count: int
    processed_pages: int
    cover_filename: str | None
    current_page: int
    error: str | None
    created_at: str
    content_fingerprint: str | None = None

    def json(self) -> dict[str, Any]:
        result = asdict(self)
        result["progress"] = self.processed_pages / self.page_count if self.page_count else 0
        return result
