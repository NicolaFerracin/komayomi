from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Provider:
    id: str
    name: str
    model: str
    key: str | None

    @property
    def configured(self) -> bool:
        return bool(self.key) or self.id == "mock"


DEFAULT_MODELS = {
    "openai": "gpt-4.1-mini",
    "anthropic": "claude-sonnet-4-5",
    "gemini": "gemini-2.5-flash",
    "mock": "local-preview",
}


def providers() -> list[Provider]:
    generic_provider = os.getenv("LLM_PROVIDER", "openai").lower()
    generic_key = os.getenv("LLM_API_KEY")
    result = []
    for provider_id, name, key_env in (
        ("openai", "OpenAI", "OPENAI_API_KEY"),
        ("anthropic", "Anthropic", "ANTHROPIC_API_KEY"),
        ("gemini", "Google Gemini", "GEMINI_API_KEY"),
    ):
        key = os.getenv(key_env) or (generic_key if generic_provider == provider_id else None)
        model = os.getenv(f"{provider_id.upper()}_MODEL", DEFAULT_MODELS[provider_id])
        result.append(Provider(provider_id, name, model, key))
    if os.getenv("KOMAYOMI_ENABLE_MOCK_LLM") == "1":
        result.append(Provider("mock", "Local test provider", DEFAULT_MODELS["mock"], "local"))
    return result


def public_status() -> dict[str, Any]:
    available = providers()
    preferred = os.getenv("LLM_PROVIDER", "openai").lower()
    return {
        "preferred": preferred,
        "providers": [
            {"id": item.id, "name": item.name, "model": item.model, "configured": item.configured}
            for item in available
        ],
    }


def resolve(provider_id: str | None) -> Provider:
    requested = (provider_id or os.getenv("LLM_PROVIDER", "openai")).lower()
    provider = next((item for item in providers() if item.id == requested), None)
    if not provider:
        raise ValueError(f"Unknown LLM provider: {requested}")
    if not provider.configured:
        raise ValueError(f"{provider.name} is not configured. Add its API key to .env.")
    return provider


def _json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
    return json.loads(text)


async def structured_vision(provider_id: str | None, prompt: str, image: bytes, mime: str, schema: dict) -> tuple[dict, Provider]:
    provider = resolve(provider_id)
    if provider.id == "mock":
        return {"summary": "Mock analysis", "notes": [], "lines": []}, provider
    encoded = base64.b64encode(image).decode()
    async with httpx.AsyncClient(timeout=120) as client:
        if provider.id == "openai":
            response = await client.post("https://api.openai.com/v1/responses", headers={
                "Authorization": f"Bearer {provider.key}", "Content-Type": "application/json",
            }, json={
                "model": provider.model,
                "input": [{"role": "user", "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": f"data:{mime};base64,{encoded}", "detail": "high"},
                ]}],
                "text": {"format": {"type": "json_schema", "name": "komayomi_result", "strict": True, "schema": schema}},
            })
            response.raise_for_status()
            payload = response.json()
            text = payload.get("output_text") or payload["output"][0]["content"][0]["text"]
        elif provider.id == "anthropic":
            response = await client.post("https://api.anthropic.com/v1/messages", headers={
                "x-api-key": provider.key or "", "anthropic-version": "2023-06-01", "Content-Type": "application/json",
            }, json={
                "model": provider.model, "max_tokens": 4096,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": mime, "data": encoded}},
                    {"type": "text", "text": prompt + "\nReturn only JSON matching this schema:\n" + json.dumps(schema)},
                ]}],
            })
            response.raise_for_status()
            text = response.json()["content"][0]["text"]
        else:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{provider.model}:generateContent",
                headers={"x-goog-api-key": provider.key or "", "Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": mime, "data": encoded}}]}],
                    "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": schema},
                },
            )
            response.raise_for_status()
            text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    return _json(text), provider


async def structured_text(provider_id: str | None, prompt: str, schema: dict) -> tuple[dict, Provider]:
    provider = resolve(provider_id)
    if provider.id == "mock": return {"interpretation": "Mock explanation", "breakdown": [], "uncertainty": "Mock provider"}, provider
    async with httpx.AsyncClient(timeout=90) as client:
        if provider.id == "openai":
            response = await client.post("https://api.openai.com/v1/responses", headers={"Authorization": f"Bearer {provider.key}", "Content-Type": "application/json"}, json={
                "model": provider.model, "input": prompt,
                "text": {"format": {"type": "json_schema", "name": "grammar_explanation", "strict": True, "schema": schema}},
            }); response.raise_for_status(); payload = response.json(); text = payload.get("output_text") or payload["output"][0]["content"][0]["text"]
        elif provider.id == "anthropic":
            response = await client.post("https://api.anthropic.com/v1/messages", headers={"x-api-key": provider.key or "", "anthropic-version": "2023-06-01", "Content-Type": "application/json"}, json={
                "model": provider.model, "max_tokens": 2048, "messages": [{"role": "user", "content": prompt + "\nReturn only JSON matching:\n" + json.dumps(schema)}],
            }); response.raise_for_status(); text = response.json()["content"][0]["text"]
        else:
            response = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{provider.model}:generateContent", headers={"x-goog-api-key": provider.key or "", "Content-Type": "application/json"}, json={
                "contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": schema},
            }); response.raise_for_status(); text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    return _json(text), provider
