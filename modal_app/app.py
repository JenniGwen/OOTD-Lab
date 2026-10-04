"""Entry point: `modal deploy app.py` (run from this directory).

Serves, from one CPU container:
    POST /jobs                         create a job, returns {job_id}
    GET  /jobs/{job_id}                status + per-step results + total cost
    GET  /jobs/{job_id}/steps/{n}/image  PNG of step n (n=0: the normalized person photo)
    POST /jobs/{job_id}/replace        swap/retry one item and re-run from that step
    POST /classify                     classify one garment image
    /ui                                Gradio UI
"""
import modal

import config
from classifier import classify_item  # noqa: F401  (registers the function on the app)
from common import app, cpu_image, results_vol
from models import Leffa, QwenEdit  # noqa: F401
from pipeline import (JobBusy, JobNotFound, create_job, job_dir, load_job, public_status,
                      replace_item, run_pipeline, start_replace)  # noqa: F401

_CATEGORY_CHOICES = [c for c in config.CATEGORIES if c != "unknown"]


def load_image_ref(ref: str) -> bytes:
    """Accepts a data URL, raw base64 or an http(s) URL."""
    import base64
    import binascii

    import httpx

    if not isinstance(ref, str) or not ref.strip():
        raise ValueError("image is required (base64 or URL)")
    ref = ref.strip()
    if ref.startswith(("http://", "https://")):
        with httpx.stream("GET", ref, follow_redirects=True, timeout=30) as response:
            response.raise_for_status()
            data = b""
            for chunk in response.iter_bytes():
                data += chunk
                if len(data) > config.MAX_IMAGE_BYTES:
                    raise ValueError("image is larger than the allowed size")
        return data
    if ref.startswith("data:"):
        ref = ref.split(",", 1)[-1]
    try:
        data = base64.b64decode(ref, validate=False)
    except (binascii.Error, ValueError) as error:
        raise ValueError(f"image is neither a URL nor valid base64: {error}") from error
    if len(data) > config.MAX_IMAGE_BYTES:
        raise ValueError("image is larger than the allowed size")
    return data


def build_ui():
    import gradio as gr
    from PIL import Image

    headers = ["item_id", "file", "category", "subtype", "confidence", "needs_review", "size"]

    def read_file(path: str) -> bytes:
        with open(path, "rb") as f:
            return f.read()

    def preview(files):
        # captions match the item_id used in the classification table
        return [(path, f"item{i}") for i, path in enumerate(files or [], start=1)]

    def classify(files):
        if not files:
            raise gr.Error("Upload minimal satu foto pakaian.")
        if len(files) > config.MAX_ITEMS_PER_JOB:
            raise gr.Error(f"Maksimal {config.MAX_ITEMS_PER_JOB} item per job.")
        ids = [f"item{i}" for i in range(1, len(files) + 1)]
        results = classify_item.map([read_file(path) for path in files], ids, return_exceptions=True)
        rows = []
        for item_id, path, result in zip(ids, files, results):
            if isinstance(result, Exception):
                result = {"category": "unknown", "subtype": "", "confidence": 0.0, "needs_review": True}
            rows.append([item_id, path.rsplit("/", 1)[-1], result["category"], result["subtype"],
                         result["confidence"], "ya" if result["needs_review"] else "tidak", ""])
        return rows

    def run(person, files, rows, mode, height, weight):
        if not person:
            raise gr.Error("Upload foto orang dulu.")
        if not files:
            raise gr.Error("Upload minimal satu foto pakaian.")
        rows = [row for row in (rows or []) if row and str(row[0]).strip()]
        if len(rows) != len(files):
            raise gr.Error("Klik 'Klasifikasi' dulu (jumlah baris tabel harus sama dengan jumlah foto).")
        items = []
        for path, row in zip(files, rows):
            category = str(row[2]).strip().lower()
            if category == "unknown":
                category = None  # classified again by the pipeline; Qwen handles it if still unknown
            elif category not in _CATEGORY_CHOICES:
                raise gr.Error(f"Kategori '{row[2]}' untuk {row[0]} tidak valid. Pilih salah satu: {', '.join(_CATEGORY_CHOICES)}.")
            items.append({"item_id": str(row[0]), "image": read_file(path), "category_override": category,
                          "subtype": str(row[3] or ""), "size": str(row[6] or "") if len(row) > 6 else ""})
        try:
            job_id = create_job(read_file(person), items, mode, height_cm=height or None, weight_kg=weight or None)
        except ValueError as error:
            raise gr.Error(str(error))
        return job_id, gr.Timer(active=True)

    def replace(job_id, step_number, new_image, category, size):
        if not job_id:
            raise gr.Error("Belum ada job.")
        try:
            start_replace(
                job_id.strip(),
                int(step_number),
                read_file(new_image) if new_image else None,
                category if category in _CATEGORY_CHOICES else None,
                size if size in config.SIZES else None,
            )
        except JobNotFound:
            raise gr.Error("Job tidak ditemukan.")
        except (JobBusy, ValueError) as error:
            raise gr.Error(str(error))
        return gr.Timer(active=True)

    def refresh(job_id):
        if not job_id:
            return [], "", "", gr.Timer(active=False)
        try:
            job = load_job(job_id.strip())
        except JobNotFound:
            return [], "Job tidak ditemukan.", "", gr.Timer(active=False)
        results_vol.reload()
        gallery = []
        lines = ["| step | item | kategori | size (fit) | engine | status | GPU dtk | cold start dtk | biaya |",
                 "|---|---|---|---|---|---|---|---|---|"]
        for step in job["steps"]:
            if step["status"] == "done" and step["image_path"]:
                try:
                    image = Image.open(step["image_path"])
                    image.load()
                    gallery.append((image, f"step {step['step']}: {step['category']} ({step['engine']})"))
                except OSError:
                    pass
            note = f" — {step['error']}" if step["error"] else ""
            lines.append(
                f"| {step['step']} | {step['item_id']} | {step['category']} "
                f"| {step.get('size') or '-'} ({step.get('fit_label', 'regular')}) | {step['engine'] or '-'} "
                f"| {step['status']}{note} | {step['gpu_seconds']:.1f} | {step['cold_start_seconds']:.1f} "
                f"| ${step['cost_usd']:.4f} |"
            )
        status = f"**Status: {job['status']}** (step {job['current_step']}/{len(job['steps'])})"
        body = job.get("body") or {}
        if body.get("size"):
            status += (f"\n\nBadan: {body['height_cm']:.0f} cm, {body['weight_kg']:.0f} kg → "
                       f"size yang pas **{body['size']}**")
        if job.get("error"):
            status += f"\n\n**Error:** {job['error']}"
        if job["warnings"]:
            status += "\n\n**Warnings:**\n" + "\n".join(f"- {w}" for w in job["warnings"])
        if job["steps"]:
            status += "\n\n" + "\n".join(lines)
        cost = f"### Total biaya job: ${job['total_cost_usd']:.4f}"
        active = job["status"] in ("queued", "classifying", "running")
        return gallery, status, cost, gr.Timer(active=active)

    with gr.Blocks(title="OOTD-Lab Try-On") as demo:
        gr.Markdown("# OOTD-Lab — Hybrid Virtual Try-On\nLeffa (atasan/bawahan/dress) → Qwen-Image-Edit (alas/aksesoris)")
        with gr.Row():
            with gr.Column():
                person = gr.Image(label="Foto orang (seluruh badan)", type="filepath", height=360)
                garments = gr.File(label="Foto pakaian (boleh banyak)", file_count="multiple",
                                   file_types=["image"], type="filepath")
                garment_preview = gr.Gallery(label="Preview pakaian", columns=4, height=200,
                                             object_fit="contain", interactive=False)
                classify_button = gr.Button("1. Klasifikasi")
                table = gr.Dataframe(
                    headers=headers, type="array", interactive=True, wrap=True,
                    label=f"Hasil klasifikasi — koreksi kolom category bila salah ({', '.join(_CATEGORY_CHOICES)}); "
                          f"kolom size opsional ({', '.join(config.SIZES)}), kosong = pas badan",
                )
                with gr.Row():
                    height = gr.Number(label="Tinggi badan (cm) — opsional", value=None, minimum=0)
                    weight = gr.Number(label="Berat badan (kg) — opsional", value=None, minimum=0)
                mode = gr.Radio(list(config.QWEN_MODES), value=config.QWEN_DEFAULT_MODE,
                                label="Mode Qwen (alas/aksesoris)")
                run_button = gr.Button("2. Jalankan try-on", variant="primary")
            with gr.Column():
                job_box = gr.Textbox(label="Job ID", interactive=True)
                cost_md = gr.Markdown()
                gallery = gr.Gallery(label="Hasil per step", columns=3, height=420)
                status_md = gr.Markdown()
                refresh_button = gr.Button("Refresh status")
                with gr.Accordion("Ganti satu item (ulang dari step itu saja)", open=False):
                    step_number = gr.Number(label="Nomor step", value=1, precision=0, minimum=1)
                    new_image = gr.Image(label="Foto pakaian baru (kosongkan = coba ulang item yang sama)",
                                         type="filepath", height=200)
                    new_category = gr.Dropdown(["(otomatis)"] + _CATEGORY_CHOICES, value="(otomatis)",
                                               label="Kategori")
                    new_size = gr.Dropdown(["(tetap)"] + config.SIZES, value="(tetap)", label="Size")
                    replace_button = gr.Button("Ganti & jalankan ulang")

        timer = gr.Timer(3, active=False)
        outputs = [gallery, status_md, cost_md, timer]
        garments.change(preview, inputs=garments, outputs=garment_preview)
        classify_button.click(classify, inputs=garments, outputs=table)
        run_button.click(run, inputs=[person, garments, table, mode, height, weight], outputs=[job_box, timer])
        replace_button.click(replace, inputs=[job_box, step_number, new_image, new_category, new_size],
                             outputs=timer)
        refresh_button.click(refresh, inputs=job_box, outputs=outputs)
        timer.tick(refresh, inputs=job_box, outputs=outputs)
    return demo


@app.function(
    image=cpu_image,
    volumes={config.RESULTS_DIR: results_vol},
    max_containers=1,  # Gradio keeps session state in memory: one container only
    scaledown_window=config.WEB_SCALEDOWN_WINDOW,
    timeout=600,
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def web():
    import os

    import gradio as gr
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.concurrency import run_in_threadpool
    from fastapi.responses import RedirectResponse, Response

    api = FastAPI(title="OOTD-Lab Try-On API")

    def with_urls(status: dict, request: Request) -> dict:
        base = str(request.base_url).rstrip("/")
        for step in status["steps"]:
            step["image_url"] = (
                f"{base}/jobs/{status['job_id']}/steps/{step['step']}/image" if step["status"] == "done" else None
            )
        return status

    async def json_body(request: Request) -> dict:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Body must be JSON.")
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Body must be a JSON object.")
        return body

    def _create(body: dict) -> str:
        raw_items = body.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            raise ValueError("items must be a non-empty list")
        items = []
        for index, item in enumerate(raw_items, start=1):
            if not isinstance(item, dict):
                raise ValueError(f"items[{index - 1}] must be an object")
            items.append({
                "item_id": item.get("item_id") or f"item{index}",
                "image": load_image_ref(item.get("image")),
                "category_override": item.get("category_override") or None,
                "subtype": item.get("subtype") or None,
                "size": item.get("size") or None,
            })
        return create_job(load_image_ref(body.get("person_image")), items,
                          body.get("qwen_mode") or config.QWEN_DEFAULT_MODE,
                          height_cm=body.get("height_cm"), weight_kg=body.get("weight_kg"))

    @api.get("/")
    def root():
        return RedirectResponse("/ui")

    @api.post("/jobs")
    async def post_job(request: Request):
        body = await json_body(request)
        try:
            job_id = await run_in_threadpool(_create, body)
        except Exception as error:  # bad input or unreachable image URL
            raise HTTPException(status_code=400, detail=str(error))
        return {"job_id": job_id}

    @api.get("/jobs/{job_id}")
    def get_job(job_id: str, request: Request):
        try:
            return with_urls(public_status(load_job(job_id)), request)
        except JobNotFound:
            raise HTTPException(status_code=404, detail="Job not found.")

    @api.get("/jobs/{job_id}/steps/{step}/image")
    def get_step_image(job_id: str, step: int):
        try:
            job = load_job(job_id)
        except JobNotFound:
            raise HTTPException(status_code=404, detail="Job not found.")
        if step == 0:
            path = f"{job_dir(job['job_id'])}/inputs/person.png"
        elif 1 <= step <= len(job["steps"]) and job["steps"][step - 1]["image_path"]:
            path = job["steps"][step - 1]["image_path"]
        else:
            raise HTTPException(status_code=404, detail="This step has no image (yet).")
        results_vol.reload()
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Image not found on the Volume.")
        with open(path, "rb") as f:
            return Response(content=f.read(), media_type="image/png")

    def _replace(job_id: str, body: dict) -> dict:
        step_index = body.get("step_index")
        if not isinstance(step_index, int):
            raise ValueError("step_index (integer, 1-based) is required")
        image = body.get("image")
        return start_replace(job_id, step_index, load_image_ref(image) if image else None,
                             body.get("category_override") or None, body.get("size") or None)

    @api.post("/jobs/{job_id}/replace")
    async def post_replace(job_id: str, request: Request):
        body = await json_body(request)
        try:
            status = await run_in_threadpool(_replace, job_id, body)
        except JobNotFound:
            raise HTTPException(status_code=404, detail="Job not found.")
        except JobBusy as error:
            raise HTTPException(status_code=409, detail=str(error))
        except Exception as error:
            raise HTTPException(status_code=400, detail=str(error))
        return with_urls(status, request)

    @api.post("/classify")
    async def post_classify(request: Request):
        body = await json_body(request)
        try:
            data = await run_in_threadpool(load_image_ref, body.get("image"))
        except Exception as error:
            raise HTTPException(status_code=400, detail=str(error))
        return await classify_item.remote.aio(data, str(body.get("item_id") or "item1"))

    return gr.mount_gradio_app(api, build_ui(), path="/ui")
