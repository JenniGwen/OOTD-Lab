"""Garment classification: Modal Shared Endpoint (VL model) with a FashionCLIP fallback.

`classify_item` never raises for a bad image/model answer: it returns
`needs_review: true` so the user can correct the category in the UI.
"""
from typing import Optional
import base64
import io
import json
import os
import random
import re
import threading
import time

import modal

import config
from common import app, classifier_image, hf_cache_vol, image_from_bytes

_VALID = set(config.CATEGORIES)
_JSON_SCHEMA = {
    "name": "item_classification",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": config.CATEGORIES},
            "subtype": {"type": "string"},
            "confidence": {"type": "number"},
        },
        "required": ["category", "subtype", "confidence"],
        "additionalProperties": False,
    },
}

_clip = None
_clip_lock = threading.Lock()


def _endpoint_config():
    url = os.environ.get("VL_ENDPOINT_URL", "").strip().rstrip("/")
    token_id = os.environ.get("MODAL_PROXY_TOKEN_ID", "").strip()
    token_secret = os.environ.get("MODAL_PROXY_TOKEN_SECRET", "").strip()
    if not (url.startswith("http") and token_id and token_secret):
        return None
    if url.endswith("/v1"):
        url = url[: -len("/v1")]
    return url, f"{token_id}.{token_secret}"


def _data_url(image_bytes: bytes) -> str:
    img = image_from_bytes(image_bytes)
    img.thumbnail((config.VL_IMAGE_MAX_SIDE, config.VL_IMAGE_MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def parse_classification(text: str) -> Optional[dict]:
    """Pull {category, subtype, confidence} out of a model reply; None if invalid."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL)
    # the answer is the last JSON object in the reply (thinking models may ramble first)
    for candidate in reversed(re.findall(r"\{[^{}]*\}", text)):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        category = str(data.get("category", "")).strip().lower()
        if category not in _VALID:
            continue
        try:
            confidence = float(data.get("confidence"))
        except (TypeError, ValueError):
            continue
        if not 0.0 <= confidence <= 1.0:
            continue
        return {
            "category": category,
            "subtype": str(data.get("subtype", "")).strip().lower()[:40],
            "confidence": confidence,
        }
    return None


def _classify_vl(image_bytes: bytes) -> Optional[dict]:
    """Ask the shared endpoint. Returns None when it is not configured or the reply is unusable."""
    import httpx

    endpoint = _endpoint_config()
    if endpoint is None:
        return None
    url, token = endpoint
    payload = {
        "model": config.VL_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": _data_url(image_bytes)}},
                {"type": "text", "text": config.CLASSIFY_PROMPT},
            ],
        }],
        "max_tokens": config.VL_MAX_TOKENS,
        "temperature": 0,
        # VERIFY: structured output is requested the OpenAI way. Modal's docs only
        # promise an OpenAI-compatible Chat Completions API, not json_schema support
        # for this model, so a 400/422 answer triggers one retry without it and the
        # reply is always validated by parse_classification().
        "response_format": {"type": "json_schema", "json_schema": _JSON_SCHEMA},
    }
    headers = {"Authorization": f"Bearer {token}"}
    for attempt in range(config.VL_MAX_RETRIES + 1):
        try:
            response = httpx.post(f"{url}/v1/chat/completions", json=payload, headers=headers,
                                  timeout=config.VL_TIMEOUT_SECONDS)
        except httpx.HTTPError as error:
            print(f"[classifier] endpoint error: {error!r}")
            response = None
        if response is not None:
            if response.status_code == 200:
                try:
                    message = response.json()["choices"][0]["message"]
                except (ValueError, KeyError, IndexError, TypeError):
                    print(f"[classifier] unexpected reply: {response.text[:300]}")
                    return None
                return parse_classification(message.get("content") or "")
            if response.status_code in (400, 422) and "response_format" in payload:
                payload.pop("response_format")
                continue
            if response.status_code != 429 and response.status_code < 500:
                print(f"[classifier] endpoint HTTP {response.status_code}: {response.text[:300]}")
                return None
        # 429 (shared concurrency limit), 5xx or network error: backoff with jitter
        time.sleep(min(20.0, 2.0 ** attempt) + random.random())
    return None


def _classify_clip(image_bytes: bytes) -> dict:
    """Zero-shot FashionCLIP on CPU. Weights come from the hf-cache Volume."""
    global _clip
    import torch

    with _clip_lock:
        if _clip is None:
            from transformers import CLIPModel, CLIPProcessor

            model = CLIPModel.from_pretrained(config.CLIP_MODEL_ID).eval()
            processor = CLIPProcessor.from_pretrained(config.CLIP_MODEL_ID)
            labels = [(category, subtype) for category, subtypes in config.CLIP_LABELS.items() for subtype in subtypes]
            _clip = (model, processor, labels)
        model, processor, labels = _clip
        inputs = processor(
            text=[f"a photo of {subtype}, a type of clothing item" for _, subtype in labels],
            images=image_from_bytes(image_bytes),
            return_tensors="pt",
            padding=True,
        )
        with torch.no_grad():
            probs = model(**inputs).logits_per_image[0].softmax(dim=-1).tolist()

    by_category: dict[str, float] = {}
    for (category, _), prob in zip(labels, probs):
        by_category[category] = by_category.get(category, 0.0) + prob
    category = max(by_category, key=by_category.get)
    subtype = max(((p, s) for (c, s), p in zip(labels, probs) if c == category))[1]
    return {"category": category, "subtype": subtype, "confidence": by_category[category]}


@app.function(
    image=classifier_image,
    volumes={config.HF_CACHE_DIR: hf_cache_vol},
    secrets=[modal.Secret.from_name(config.VL_SECRET_NAME)],
    cpu=2.0,
    memory=4096,
    max_containers=1,  # with max_inputs below this caps in-flight endpoint requests
    scaledown_window=config.SCALEDOWN_WINDOW,
    timeout=600,
)
@modal.concurrent(max_inputs=config.VL_MAX_CONCURRENCY)
def classify_item(image_bytes: bytes, item_id: str = "") -> dict:
    """Returns an ItemClassification dict (plus `source`: vl | clip | none)."""
    result, source = None, "none"
    try:
        result = _classify_vl(image_bytes)
        source = "vl"
    except Exception as error:  # never crash the job because of the classifier
        print(f"[classifier] VL failed for {item_id}: {error!r}")
    if result is None:
        try:
            result = _classify_clip(image_bytes)
            source = "clip"
        except Exception as error:
            print(f"[classifier] CLIP fallback failed for {item_id}: {error!r}")
    if result is None:
        return {"item_id": item_id, "category": "unknown", "subtype": "", "confidence": 0.0,
                "needs_review": True, "source": "none"}
    needs_review = result["category"] == "unknown" or result["confidence"] < config.CONFIDENCE_THRESHOLD
    return {
        "item_id": item_id,
        "category": result["category"],
        "subtype": result["subtype"],
        "confidence": round(result["confidence"], 3),
        "needs_review": needs_review,
        "source": source,
    }
