"""Job orchestration: classify -> plan -> chained try-on steps, with per-step storage and cost.

Layout on the `tryon-results` Volume:
    /results/{job_id}/inputs/person.png          normalized to 768x1024
    /results/{job_id}/inputs/{n}.png             garment images, in upload order
    /results/{job_id}/step{n}_{category}.png     output of step n (input of step n+1)
    /results/{job_id}/status.json                copy of the JobStatus (the Dict is the live one)

Step numbers are 1-based and include skipped steps, so `step_index` in
replace_item always matches `step` in the JobStatus.
"""
from typing import Optional
import json
import os
import time
import uuid

import config
from classifier import classify_item
from common import ENGINE_SPECS, app, cpu_image, fit_canvas, image_from_bytes, image_to_png, jobs, results_vol
from models import GarmentLock, Leffa, QwenEdit

ACTIVE_STATUSES = ("queued", "classifying", "running")
_RUNNABLE = [c for c in config.CATEGORIES if c != "unknown"]


class JobNotFound(LookupError):
    pass


class JobBusy(RuntimeError):
    pass


# ---------------------------------------------------------------- storage
def job_dir(job_id: str) -> str:
    return f"{config.RESULTS_DIR}/{job_id}"


def _write(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def _read(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def load_job(job_id: str) -> dict:
    try:
        return jobs[job_id]
    except KeyError:
        pass
    # Dict entries expire after a week without access; fall back to the Volume copy.
    results_vol.reload()
    path = f"{job_dir(job_id)}/status.json"
    if not os.path.exists(path):
        raise JobNotFound(job_id)
    return json.loads(_read(path))


def save_job(job: dict, persist: bool = False) -> None:
    job["updated_at"] = time.time()
    jobs[job["job_id"]] = job
    if persist:
        _write(f"{job_dir(job['job_id'])}/status.json", json.dumps(job, indent=2).encode())
        results_vol.commit()


def public_status(job: dict) -> dict:
    """The JobStatus shape from the spec (internal bookkeeping fields removed)."""
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "current_step": job["current_step"],
        "steps": job["steps"],
        "total_cost_usd": round(job["total_cost_usd"], 6),
        "warnings": job["warnings"],
        "error": job.get("error"),
        "qwen_mode": job["qwen_mode"],
    }


# ---------------------------------------------------------------- job creation (called from the web container)
def _normalize_garment(data: bytes) -> bytes:
    img = image_from_bytes(data)
    img.thumbnail((1024, 1024))
    return image_to_png(img)


def create_job(person: bytes, items: list[dict], qwen_mode: str = config.QWEN_DEFAULT_MODE) -> str:
    """items: [{"item_id": str, "image": bytes, "category_override": str | None, "subtype": str | None}, ...]"""
    if qwen_mode not in config.QWEN_MODES:
        raise ValueError(f"qwen_mode must be one of {sorted(config.QWEN_MODES)}")
    if not items:
        raise ValueError("At least one item is required.")
    if len(items) > config.MAX_ITEMS_PER_JOB:
        raise ValueError(f"At most {config.MAX_ITEMS_PER_JOB} items per job.")
    for item in items:
        override = item.get("category_override")
        if override and override not in _RUNNABLE:
            raise ValueError(f"category_override must be one of {_RUNNABLE}")

    job_id = uuid.uuid4().hex[:12]
    base = job_dir(job_id)
    try:
        _write(f"{base}/inputs/person.png", image_to_png(fit_canvas(image_from_bytes(person))))
    except Exception as error:
        raise ValueError(f"person_image is not a readable image: {error}") from error
    stored = []
    for index, item in enumerate(items, start=1):
        path = f"{base}/inputs/{index}.png"
        try:
            _write(path, _normalize_garment(item["image"]))
        except Exception as error:
            raise ValueError(f"item {index} is not a readable image: {error}") from error
        stored.append({
            "item_id": str(item.get("item_id") or f"item{index}"),
            "garment_path": path,
            "category_override": item.get("category_override") or None,
            # optional hint kept when the category is set by hand (drives Leffa's mask and Qwen's prompt)
            "subtype": str(item.get("subtype") or "").strip().lower()[:40],
        })

    job = {
        "job_id": job_id,
        "status": "queued",
        "current_step": 0,
        "steps": [],
        "total_cost_usd": 0.0,
        "warnings": [],
        "error": None,
        "qwen_mode": qwen_mode,
        "items": stored,
        "created_at": time.time(),
    }
    save_job(job, persist=True)  # commits the input images too
    run_pipeline.spawn(job_id)
    return job_id


def start_replace(job_id: str, step_index: int, new_garment: Optional[bytes] = None,
                  category_override: Optional[str] = None) -> dict:
    """Validate and queue a replace_item run. Returns the public status."""
    job = load_job(job_id)
    if job["status"] in ACTIVE_STATUSES:
        raise JobBusy(f"Job {job_id} is still {job['status']}; wait until it finishes.")
    if not 1 <= step_index <= len(job["steps"]):
        raise ValueError(f"step_index must be between 1 and {len(job['steps'])}")
    if category_override and category_override not in _RUNNABLE:
        raise ValueError(f"category_override must be one of {_RUNNABLE}")
    if new_garment is not None:
        try:
            new_garment = _normalize_garment(new_garment)
        except Exception as error:
            raise ValueError(f"new garment is not a readable image: {error}") from error
    job["status"] = "queued"
    save_job(job)
    replace_item.spawn(job_id, step_index, new_garment, category_override)
    return public_status(job)


# ---------------------------------------------------------------- planning
def _new_step(number: int, item: dict, category: str, subtype: str) -> dict:
    engine = config.engine_for(category, subtype)
    return {
        "step": number,
        "item_id": item["item_id"],
        "category": category,
        "subtype": subtype,
        "engine": engine,
        "gpu": ENGINE_SPECS[engine]["gpu"] if engine else None,
        "image_path": None,
        "gpu_seconds": 0.0,
        "cold_start_seconds": 0.0,
        "cost_usd": 0.0,
        "status": "pending",  # pending | running | done | failed | skipped
        "error": None,
        "garment_path": item["garment_path"],
    }


def build_plan(classified: list[dict]) -> tuple[list[dict], list[str]]:
    """classified: stored items + category/subtype/confidence/needs_review. Returns (steps, warnings)."""
    warnings = []
    order = {category: index for index, category in enumerate(config.CATEGORY_ORDER)}
    ranked = sorted(enumerate(classified), key=lambda pair: (order.get(pair[1]["category"], len(order)), pair[0]))
    has_dress = any(item["category"] == "dress" for item in classified)
    used_slots = set()
    steps = []
    for number, (_, item) in enumerate(ranked, start=1):
        category = item["category"]
        step = _new_step(number, item, category, item.get("subtype", ""))
        skip_reason = None
        if has_dress and category in ("atasan", "bawahan"):
            skip_reason = "skipped because the outfit contains a dress"
        elif category in config.SINGLE_SLOT_CATEGORIES and category in used_slots:
            skip_reason = f"only one '{category}' item per outfit; the first one is used"
        if skip_reason:
            step["status"] = "skipped"
            step["error"] = skip_reason
            warnings.append(f"{item['item_id']} ({category}): {skip_reason}")
        else:
            used_slots.add(category)
            if item.get("needs_review"):
                warnings.append(
                    f"{item['item_id']}: type not recognized (confidence "
                    f"{item.get('confidence', 0):.2f}); left to Qwen, check the result"
                )
        steps.append(step)
    return steps, warnings


def _classify_items(job: dict) -> list[dict]:
    items = job["items"]
    pending = [item for item in items if not item["category_override"]]
    results = {}
    if pending:
        blobs = [_read(item["garment_path"]) for item in pending]
        ids = [item["item_id"] for item in pending]
        for item, result in zip(pending, classify_item.map(blobs, ids, return_exceptions=True)):
            if isinstance(result, Exception):
                result = {"category": "unknown", "subtype": "", "confidence": 0.0, "needs_review": True}
            results[item["garment_path"]] = result
    classified = []
    for item in items:
        if item["category_override"]:
            info = {"category": item["category_override"], "subtype": item.get("subtype", ""),
                    "confidence": 1.0, "needs_review": False}
        else:
            info = results[item["garment_path"]]
            if info.get("needs_review"):
                # The classifier is not sure what this is: do not guess a Leffa slot,
                # let Qwen work out the item and how it is worn.
                info = {**info, "category": "unknown", "subtype": ""}
        classified.append({**item, "category": info["category"], "subtype": info.get("subtype", ""),
                           "confidence": info.get("confidence", 0.0), "needs_review": info.get("needs_review", False)})
    return classified


# ---------------------------------------------------------------- execution
def _input_for_step(job: dict, step_number: int) -> bytes:
    """Output of the last finished step before `step_number`, or the person photo."""
    for step in reversed(job["steps"][: step_number - 1]):
        if step["status"] == "done" and step["image_path"]:
            return _read(step["image_path"])
    return _read(f"{job_dir(job['job_id'])}/inputs/person.png")


def _execute(job: dict, start_step: int = 1) -> dict:
    job["status"] = "running"
    job["error"] = None
    current = _input_for_step(job, start_step)
    failed = False
    for step in job["steps"][start_step - 1:]:
        if step["status"] == "skipped":
            continue
        job["current_step"] = step["step"]
        step["status"] = "running"
        save_job(job)

        spec = ENGINE_SPECS[step["engine"]]
        started = time.monotonic()
        try:
            garment = _read(step["garment_path"])
            if step["engine"] == "leffa":
                out = Leffa().tryon.remote(current, garment, step["category"], step["subtype"])
            else:
                out = QwenEdit().tryon.remote(current, garment, step["category"], step["subtype"], job["qwen_mode"])
        except Exception as error:
            # Earlier step images stay on the Volume; only this step is marked failed.
            wall = time.monotonic() - started
            step.update(status="failed", error=f"{type(error).__name__}: {error}"[:1000],
                        gpu_seconds=0.0, cold_start_seconds=round(wall, 2),
                        cost_usd=round(wall * spec["rate"], 6))  # upper bound: time spent waiting on the GPU
            job["total_cost_usd"] += step["cost_usd"]
            job["status"] = "failed"
            job["error"] = f"step {step['step']} ({step['category']}) failed: {step['error']}"
            failed = True
            break

        wall = time.monotonic() - started
        gpu_seconds = out["exec_seconds"]
        skip = config.QWEN_COLOR_LOCK_SKIP.get(step["category"], [])
        if step["engine"] == "qwen" and skip is not None:
            # Qwen repaints everything: put back any garment whose color it changed.
            try:
                locked = GarmentLock().restore.remote(current, out["image"], skip)
                out["image"] = locked["image"]
                if locked["restored"]:
                    job["warnings"].append(
                        f"step {step['step']} ({step['category']}): Qwen changed the color of "
                        f"{', '.join(locked['restored'])}; restored from the previous step"
                    )
            except Exception as error:
                job["warnings"].append(f"step {step['step']}: garment color check failed ({type(error).__name__})")
        # Container boot + model load are billed too, but only when this call started the container.
        cold_start = max(0.0, wall - gpu_seconds) if out["was_cold"] else 0.0
        path = f"{job_dir(job['job_id'])}/step{step['step']}_{step['category']}.png"
        _write(path, out["image"])
        step.update(status="done", error=None, image_path=path,
                    gpu_seconds=round(gpu_seconds, 2), cold_start_seconds=round(cold_start, 2),
                    cost_usd=round((gpu_seconds + cold_start) * spec["rate"], 6))
        job["total_cost_usd"] += step["cost_usd"]
        current = out["image"]
        save_job(job, persist=True)  # commit the image before moving on

    if not failed:
        job["status"] = "done"
        if not any(step["status"] == "done" for step in job["steps"]):
            job["warnings"].append("No step could be run (all items were skipped).")
    save_job(job, persist=True)
    return public_status(job)


def _fail(job_id: str, error: Exception) -> dict:
    job = load_job(job_id)
    job["status"] = "failed"
    job["error"] = f"{type(error).__name__}: {error}"[:1000]
    save_job(job, persist=True)
    return public_status(job)


@app.function(image=cpu_image, volumes={config.RESULTS_DIR: results_vol}, timeout=3600)
def run_pipeline(job_id: str) -> dict:
    try:
        results_vol.reload()
        job = load_job(job_id)
        job["status"] = "classifying"
        save_job(job)
        job["steps"], job["warnings"] = build_plan(_classify_items(job))
        return _execute(job, start_step=1)
    except Exception as error:
        return _fail(job_id, error)


@app.function(image=cpu_image, volumes={config.RESULTS_DIR: results_vol}, timeout=3600)
def replace_item(job_id: str, step_index: int, new_garment: Optional[bytes] = None,
                 category_override: Optional[str] = None) -> dict:
    """Re-run from `step_index` (1-based) using the stored output of the step before it.

    new_garment=None retries the step with the same garment. Later steps are
    re-run as well, because each of them was built on top of the replaced one.
    """
    try:
        results_vol.reload()
        job = load_job(job_id)
        step = job["steps"][step_index - 1]
        category, subtype = step["category"], step["subtype"]

        if new_garment is not None:
            _write(step["garment_path"], new_garment)
            if category_override:
                category, subtype = category_override, ""
            else:
                try:
                    info = classify_item.remote(new_garment, step["item_id"])
                except Exception:
                    info = {"category": "unknown", "subtype": "", "needs_review": True}
                if info["category"] == category:
                    subtype = info.get("subtype", "")
                elif category in config.ENGINE_BY_CATEGORY:
                    # keep the slot: a step's position in the chain depends on its category
                    job["warnings"].append(
                        f"step {step_index}: new item looks like '{info['category']}' but is applied as "
                        f"'{category}'; pass category_override to change that"
                    )
                    subtype = ""
                else:
                    category, subtype = info["category"], info.get("subtype", "")
        elif category_override:
            category, subtype = category_override, ""

        if category not in config.ENGINE_BY_CATEGORY:
            raise ValueError(f"step {step_index} has category '{category}'; pass category_override")

        engine = config.engine_for(category, subtype)
        step.update(category=category, subtype=subtype, engine=engine, gpu=ENGINE_SPECS[engine]["gpu"],
                    status="pending", error=None)
        for later in job["steps"][step_index - 1:]:
            if later["status"] != "skipped":
                later.update(status="pending", error=None, image_path=None,
                             gpu_seconds=0.0, cold_start_seconds=0.0, cost_usd=0.0)
        return _execute(job, start_step=step_index)
    except Exception as error:
        return _fail(job_id, error)
