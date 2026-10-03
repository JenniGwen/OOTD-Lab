import base64
import io
import os
import threading
from urllib.parse import urljoin

import requests
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from PIL import Image

# VTON_ENGINE=fashn (default) | leffa
ENGINE = os.environ.get("VTON_ENGINE", "fashn").lower()

app = FastAPI()
gpu_lock = threading.Lock()
if ENGINE == "leffa":
    from leffa_engine import LeffaEngine

    leffa = LeffaEngine()  # LEFFA_DIR / LEFFA_DC_CKPT env vars, see leffa_engine.py
else:
    from fashn_vton import TryOnPipeline

    pipeline = TryOnPipeline(weights_dir=os.environ.get("FASHN_WEIGHTS", "./weights"))

CATEGORY_MAP = {
    "Atasan": "tops",
    "Bawahan": "bottoms",
    "Terusan": "one-pieces",
}
ORDER = {"bottoms": 0, "one-pieces": 0, "tops": 1}


def load_image(src: str, asset_base_url: str) -> Image.Image:
    if src.startswith("data:"):
        raw = base64.b64decode(src.split(",", 1)[1])
    else:
        image_url = urljoin(f"{asset_base_url.rstrip('/')}/", src)
        response = requests.get(image_url, timeout=20)
        response.raise_for_status()
        raw = response.content
    return Image.open(io.BytesIO(raw)).convert("RGB")


def to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def run_tryon(person_src: str, garments: list[dict], asset_base_url: str) -> str:
    person = load_image(person_src, asset_base_url)
    if ENGINE == "leffa":
        items = [
            {**g, "image": load_image(g["imageUrl"], asset_base_url)}
            for g in garments
            if g.get("imageUrl") and g.get("category") in ("Atasan", "Bawahan", "Terusan")
        ]
        with gpu_lock:
            return to_data_url(leffa.dress(person, items))
    jobs = []
    for garment in garments:
        category = CATEGORY_MAP.get(garment.get("category"))
        if category and garment.get("imageUrl"):
            jobs.append((ORDER[category], category, garment["imageUrl"]))
    if not jobs:
        raise ValueError("No supported garments selected.")
    jobs.sort(key=lambda job: job[0])

    with gpu_lock:
        for _, category, image_url in jobs:
            result = pipeline(
                person_image=person,
                garment_image=load_image(image_url, asset_base_url),
                category=category,
            )
            person = result.images[0]
    return to_data_url(person)


@app.get("/api/vton/health")
def health():
    return {"status": "ok", "engine": ENGINE}


@app.post("/api/vton/tryon")
async def tryon(body: dict):
    try:
        image = await run_in_threadpool(
            run_tryon,
            body["personImage"],
            body.get("garments", []),
            body.get("assetBaseUrl", ""),
        )
        return {"image": image}
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error