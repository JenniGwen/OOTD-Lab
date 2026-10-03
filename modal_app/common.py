"""Shared Modal objects (app, volumes, images) and small helpers.

Every module registers its functions on the single `app` defined here. Heavy
libraries (torch, diffusers, gradio, ...) are imported inside functions, because
Modal imports the entry module in every container and each image only ships
the dependencies it needs.
"""
import io

import modal

import config

app = modal.App(config.APP_NAME)

hf_cache_vol = modal.Volume.from_name(config.HF_CACHE_VOLUME, create_if_missing=True)
leffa_vol = modal.Volume.from_name(config.LEFFA_CKPT_VOLUME, create_if_missing=True)
results_vol = modal.Volume.from_name(config.RESULTS_VOLUME, create_if_missing=True)
jobs = modal.Dict.from_name(config.JOBS_DICT, create_if_missing=True)

_LOCAL_MODULES = ("config", "common", "models", "classifier", "pipeline", "leffa_mask_fix", "download_weights")
# GPU containers must never download weights: everything comes from the Volumes.
_OFFLINE_ENV = {"HF_HOME": config.HF_HOME, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"}

# CPU: web API + Gradio UI + pipeline orchestration + weight downloads.
cpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi[standard]==0.142.2",
        "gradio==6.29.1",
        "httpx",
        "pillow",
        "huggingface_hub[hf_xet]",
    )
    .env({"HF_HOME": config.HF_HOME, "HF_XET_HIGH_PERFORMANCE": "1"})
    .add_local_python_source(*_LOCAL_MODULES)
)

# CPU: classifier (shared-endpoint client + FashionCLIP zero-shot fallback).
classifier_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("httpx", "pillow", "transformers>=4.46,<5")
    .pip_install("torch", extra_index_url="https://download.pytorch.org/whl/cpu")
    .env(_OFFLINE_ENV)
    .add_local_python_source(*_LOCAL_MODULES)
)

# GPU L40S: Leffa repo at a pinned commit. Checkpoints are mounted from the
# `leffa-ckpts` Volume at /opt/Leffa/ckpts.
# VERIFY: Leffa's requirements.txt is unpinned. The versions pinned here match its
# release period (Dec 2024) but could not be exercised on a GPU from this machine;
# if the image build or model load fails, adjust these pins first.
leffa_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .run_commands(
        f"git clone {config.LEFFA_REPO_URL} {config.LEFFA_REPO_DIR}",
        f"cd {config.LEFFA_REPO_DIR} && git checkout {config.LEFFA_REPO_COMMIT}",
        # gradio is only needed by Leffa's own demo UI; the PyPI package `config` is
        # never imported by Leffa and would shadow our own config.py
        f"grep -v -i -E '^(gradio|gradio-client|config)$' {config.LEFFA_REPO_DIR}/requirements.txt"
        " > /tmp/leffa-requirements.txt",
        "pip install -r /tmp/leffa-requirements.txt "
        "torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 "
        "diffusers==0.31.0 transformers==4.46.3 huggingface_hub==0.26.5 "
        "peft==0.13.2 accelerate==1.1.1 numpy==1.26.4",
    )
    .env({**_OFFLINE_ENV, "PYTHONPATH": config.LEFFA_REPO_DIR})
    .workdir(config.LEFFA_REPO_DIR)
    .add_local_python_source(*_LOCAL_MODULES)
)

# GPU H100: Qwen-Image-Edit-2509 through diffusers.
# VERIFY: QwenImageEditPlusPipeline exists in diffusers 0.40.0 (the model card says
# "install diffusers from main"); torch/transformers/peft are left to the resolver.
qwen_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch==2.8.0",
        "torchvision==0.23.0",
        "diffusers==0.40.0",
        "transformers>=4.56",
        "peft>=0.17",
        "accelerate",
        "safetensors",
        "sentencepiece",
        "pillow",
    )
    .env(_OFFLINE_ENV)
    .add_local_python_source(*_LOCAL_MODULES)
)


def price_per_second(gpu: str, cpu: float, memory_mib: int) -> float:
    """USD per second of one container: GPU + reserved CPU cores + reserved memory."""
    return config.PRICE_GPU[gpu] + cpu * config.PRICE_CPU_CORE + (memory_mib / 1024) * config.PRICE_MEM_GIB


ENGINE_SPECS = {
    "leffa": {"gpu": config.LEFFA_GPU, "rate": price_per_second(config.LEFFA_GPU, config.LEFFA_CPU, config.LEFFA_MEMORY_MIB)},
    "qwen": {"gpu": config.QWEN_GPU, "rate": price_per_second(config.QWEN_GPU, config.QWEN_CPU, config.QWEN_MEMORY_MIB)},
}


def image_from_bytes(data: bytes):
    """Decode image bytes to RGB; transparent pixels become white."""
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    img.load()
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        white = Image.new("RGBA", img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(white, img)
    return img.convert("RGB")


def image_to_png(img) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def fit_canvas(img, width: int = config.WORK_WIDTH, height: int = config.WORK_HEIGHT):
    """Resize keeping aspect ratio and center on a white canvas (same as Leffa's resize_and_center)."""
    from PIL import Image

    scale = min(width / img.width, height / img.height)
    new_w, new_h = max(1, int(img.width * scale)), max(1, int(img.height * scale))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    canvas.paste(resized, ((width - new_w) // 2, (height - new_h) // 2))
    return canvas
