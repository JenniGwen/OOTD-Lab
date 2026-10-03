"""Fill the Modal Volumes with model weights, on CPU containers only.

    modal run download_weights.py                 # everything
    modal run download_weights.py --only leffa    # leffa | qwen | clip

Safe to re-run: files already in the Volume are skipped.
"""
import config
from common import app, cpu_image, hf_cache_vol, leffa_vol


@app.function(image=cpu_image, volumes={config.LEFFA_CKPT_DIR: leffa_vol}, cpu=4, timeout=3600)
def download_leffa() -> str:
    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id=config.LEFFA_HF_REPO,
        local_dir=config.LEFFA_CKPT_DIR,
        allow_patterns=config.LEFFA_DOWNLOAD_PATTERNS,
    )
    leffa_vol.commit()
    return f"Leffa checkpoints -> volume '{config.LEFFA_CKPT_VOLUME}'"


@app.function(image=cpu_image, volumes={config.HF_CACHE_DIR: hf_cache_vol}, cpu=4, timeout=3 * 3600)
def download_qwen() -> str:
    from huggingface_hub import hf_hub_download, snapshot_download

    snapshot_download(repo_id=config.QWEN_MODEL_ID)
    for filename in config.QWEN_LIGHTNING_FILES.values():
        hf_hub_download(repo_id=config.QWEN_LIGHTNING_REPO, filename=filename)
    hf_cache_vol.commit()
    return f"{config.QWEN_MODEL_ID} + Lightning LoRA -> volume '{config.HF_CACHE_VOLUME}'"


@app.function(image=cpu_image, volumes={config.HF_CACHE_DIR: hf_cache_vol}, timeout=1800)
def download_clip() -> str:
    from huggingface_hub import snapshot_download

    # safetensors weights + processor/tokenizer files are enough for transformers
    snapshot_download(
        repo_id=config.CLIP_MODEL_ID,
        allow_patterns=["*.json", "*.txt", "model.safetensors"],
    )
    hf_cache_vol.commit()
    return f"{config.CLIP_MODEL_ID} -> volume '{config.HF_CACHE_VOLUME}'"


@app.local_entrypoint()
def main(only: str = ""):
    targets = {"leffa": download_leffa, "qwen": download_qwen, "clip": download_clip}
    if only:
        if only not in targets:
            raise SystemExit(f"--only must be one of {sorted(targets)}")
        targets = {only: targets[only]}
    # qwen and clip write to the same Volume; run them one after the other so
    # their commits cannot conflict. Leffa runs in parallel on its own Volume.
    calls = {}
    if "leffa" in targets:
        calls["leffa"] = targets["leffa"].spawn()
    for name in ("clip", "qwen"):
        if name in targets:
            print(targets[name].remote())
    if "leffa" in calls:
        print(calls["leffa"].get())
