"""GPU engines: Leffa (L40S) for tops/bottoms/dresses, QwenEdit (H100) for shoes/accessories.

Both load their weights from Modal Volumes in @modal.enter (containers run with
HF_HUB_OFFLINE=1, so a missing weight fails loudly instead of downloading on GPU).
Every method takes and returns PNG/JPEG bytes and reports its own timing so the
pipeline can compute cost per step.
"""
import re
import time

import modal

import config
from common import app, fit_canvas, hf_cache_vol, image_from_bytes, image_to_png, leffa_vol, leffa_image, qwen_image

# Target garment shape for Leffa's mask, from the classifier subtype.
# Same rules as leffa_engine.py at the repo root; first match wins.
_LENGTH_RULES = [
    (r"\b(mini|pendek|short|shorts|jorts|hot ?pants)\b", "mini"),
    (r"\b(midi|7/8|kulot|culottes?)\b", "midi"),
    (r"\b(maxi|panjang|long|pants|jeans|trousers|sweatpants|track|joggers?|cargo|chinos?|leggings|gamis|abaya|palazzo|kaftan|gown)\b", "ankle"),
    (r"\b(rok|skirt|dress|terusan|selutut|knee)\b", "knee"),
]
_FLARE_RULES = [
    (r"\b(flare|flared|a-?line|plisket|pleated|tutu|ruffle|mengembang|lebar|wide|palazzo|kulot|culottes?|ballgown|gown)\b", 0.45),
    (r"\b(rok|skirt|dress|terusan|gamis|abaya)\b", 0.25),
]


def garment_shape(garment_type: str, subtype: str = ""):
    """(garment_length, flare) of the TARGET garment. (None, 0.0) for tops."""
    if garment_type == "upper_body":
        return None, 0.0
    text = (subtype or "").lower()
    length = next((value for pattern, value in _LENGTH_RULES if re.search(pattern, text)), None)
    flare = next((value for pattern, value in _FLARE_RULES if re.search(pattern, text)), 0.0)
    return length, flare


@app.cls(
    image=leffa_image,
    gpu=config.LEFFA_GPU,
    cpu=config.LEFFA_CPU,
    memory=config.LEFFA_MEMORY_MIB,
    volumes={config.LEFFA_CKPT_DIR: leffa_vol},
    scaledown_window=config.SCALEDOWN_WINDOW,
    max_containers=config.LEFFA_MAX_CONTAINERS,
    timeout=900,
)
class Leffa:
    @modal.enter()
    def load(self):
        started = time.monotonic()
        # Leffa modules live in /opt/Leffa (on PYTHONPATH), see common.leffa_image.
        from leffa.inference import LeffaInference
        from leffa.model import LeffaModel
        from leffa.transform import LeffaTransform
        from leffa_utils.densepose_predictor import DensePosePredictor
        from preprocess.humanparsing.run_parsing import Parsing
        from preprocess.openpose.run_openpose import OpenPose

        from leffa_mask_fix import get_agnostic_mask_v2

        ckpt = config.LEFFA_CKPT_DIR
        self.mask_fn = get_agnostic_mask_v2
        self.transform = LeffaTransform()
        self.parsing = Parsing(
            atr_path=f"{ckpt}/humanparsing/parsing_atr.onnx",
            lip_path=f"{ckpt}/humanparsing/parsing_lip.onnx",
        )
        self.openpose = OpenPose(body_model_path=f"{ckpt}/openpose/body_pose_model.pth")
        self.densepose = DensePosePredictor(
            config_path=f"{ckpt}/densepose/densepose_rcnn_R_50_FPN_s1x.yaml",
            weights_path=f"{ckpt}/densepose/model_final_162be9.pkl",
        )
        base = f"{ckpt}/stable-diffusion-inpainting"
        self.inference = {
            "viton_hd": LeffaInference(model=LeffaModel(
                pretrained_model_name_or_path=base,
                pretrained_model=f"{ckpt}/virtual_tryon.pth",
                dtype="float16",
            )),
            "dress_code": LeffaInference(model=LeffaModel(
                pretrained_model_name_or_path=base,
                pretrained_model=f"{ckpt}/virtual_tryon_dc.pth",
                dtype="float16",
            )),
        }
        self.load_seconds = time.monotonic() - started
        self.first_call = True

    def _timing(self, started: float) -> dict:
        was_cold, self.first_call = self.first_call, False
        return {
            "exec_seconds": time.monotonic() - started,
            "was_cold": was_cold,
            "load_seconds": self.load_seconds if was_cold else 0.0,
            "gpu": config.LEFFA_GPU,
        }

    def _mask(self, person, category: str, subtype: str):
        if category not in config.LEFFA_CATEGORY:
            raise ValueError(f"Leffa does not support category '{category}'")
        garment_type, model_type = config.LEFFA_CATEGORY[category]
        length, flare = garment_shape(garment_type, subtype)
        small = person.resize((384, 512))
        model_parse, _ = self.parsing(small)
        keypoints = self.openpose(small)
        mask = self.mask_fn(model_parse, keypoints, garment_type, model_type=model_type,
                            garment_length=length, flare=flare)
        return mask.resize((config.WORK_WIDTH, config.WORK_HEIGHT)), model_type

    @modal.method()
    def mask(self, person: bytes, category: str, subtype: str = "") -> dict:
        """Agnostic mask (white = area that will be repainted) for debugging."""
        started = time.monotonic()
        person_img = fit_canvas(image_from_bytes(person))
        mask, _ = self._mask(person_img, category, subtype)
        return {"image": image_to_png(mask), **self._timing(started)}

    @modal.method()
    def tryon(self, person: bytes, garment: bytes, category: str, subtype: str = "",
              seed: int = config.LEFFA_SEED) -> dict:
        import numpy as np
        from PIL import Image

        started = time.monotonic()
        person_img = fit_canvas(image_from_bytes(person))
        garment_img = fit_canvas(image_from_bytes(garment))
        mask, model_type = self._mask(person_img, category, subtype)

        person_arr = np.array(person_img)
        if model_type == "viton_hd":
            densepose = Image.fromarray(self.densepose.predict_seg(person_arr)[:, :, ::-1])
        else:
            iuv = self.densepose.predict_iuv(person_arr)
            densepose = Image.fromarray(np.concatenate([iuv[:, :, 0:1]] * 3, axis=-1))

        data = self.transform({
            "src_image": [person_img],
            "ref_image": [garment_img],
            "mask": [mask],
            "densepose": [densepose],
        })
        output = self.inference[model_type](
            data,
            ref_acceleration=False,
            num_inference_steps=config.LEFFA_STEPS,
            guidance_scale=config.LEFFA_GUIDANCE_SCALE,
            seed=seed,
            repaint=False,
        )
        return {"image": image_to_png(output["generated_image"][0]), **self._timing(started)}


@app.cls(
    image=qwen_image,
    gpu=config.QWEN_GPU,
    cpu=config.QWEN_CPU,
    memory=config.QWEN_MEMORY_MIB,
    volumes={config.HF_CACHE_DIR: hf_cache_vol},
    scaledown_window=config.SCALEDOWN_WINDOW,
    max_containers=config.QWEN_MAX_CONTAINERS,
    timeout=1200,
)
class QwenEdit:
    @modal.enter()
    def load(self):
        started = time.monotonic()
        import torch
        from diffusers import FlowMatchEulerDiscreteScheduler, QwenImageEditPlusPipeline
        from huggingface_hub import hf_hub_download

        self.pipe = QwenImageEditPlusPipeline.from_pretrained(config.QWEN_MODEL_ID, torch_dtype=torch.bfloat16)
        self.schedulers = {
            "standard": self.pipe.scheduler,
            "lightning": FlowMatchEulerDiscreteScheduler.from_config(config.QWEN_LIGHTNING_SCHEDULER),
        }
        # Resolved from the Volume cache (HF_HUB_OFFLINE=1), never downloaded here.
        lora_path = hf_hub_download(
            repo_id=config.QWEN_LIGHTNING_REPO,
            filename=config.QWEN_LIGHTNING_FILES[config.QWEN_LIGHTNING_STEPS],
        )
        self.pipe.load_lora_weights(lora_path, adapter_name="lightning")
        self.pipe.to("cuda")
        self.pipe.set_progress_bar_config(disable=True)
        self.load_seconds = time.monotonic() - started
        self.first_call = True

    @modal.method()
    def tryon(self, person: bytes, garment: bytes, category: str, subtype: str = "",
              mode: str = config.QWEN_DEFAULT_MODE, seed: int = config.QWEN_SEED) -> dict:
        import torch

        started = time.monotonic()
        if category not in config.QWEN_PROMPTS:
            raise ValueError(f"QwenEdit has no prompt for category '{category}'")
        if mode not in config.QWEN_MODES:
            raise ValueError(f"mode must be one of {sorted(config.QWEN_MODES)}")
        settings = config.QWEN_MODES[mode]

        # One container serves both modes: the Lightning LoRA is toggled, not reloaded.
        if mode == "lightning":
            self.pipe.enable_lora()
        else:
            self.pipe.disable_lora()
        self.pipe.scheduler = self.schedulers[mode]

        person_img = fit_canvas(image_from_bytes(person))
        garment_img = image_from_bytes(garment)
        item = (subtype or "").strip() or config.QWEN_DEFAULT_ITEM[category]
        prompt = config.QWEN_PROMPTS[category].format(item=item)

        with torch.inference_mode():
            output = self.pipe(
                image=[person_img, garment_img],
                prompt=prompt,
                negative_prompt=config.QWEN_NEGATIVE_PROMPT,
                true_cfg_scale=settings["true_cfg_scale"],
                num_inference_steps=settings["steps"],
                guidance_scale=1.0,
                num_images_per_prompt=1,
                # Without these the pipeline sizes the output after the LAST input
                # image (the garment). Generating at the size the pipeline encodes the
                # person at keeps the framing; other sizes make Qwen zoom/shift the person.
                width=config.QWEN_WIDTH,
                height=config.QWEN_HEIGHT,
                generator=torch.manual_seed(seed),
            )
        result = output.images[0]
        if result.size != (config.WORK_WIDTH, config.WORK_HEIGHT):
            from PIL import Image

            result = result.resize((config.WORK_WIDTH, config.WORK_HEIGHT), Image.LANCZOS)

        was_cold, self.first_call = self.first_call, False
        return {
            "image": image_to_png(result),
            "exec_seconds": time.monotonic() - started,
            "was_cold": was_cold,
            "load_seconds": self.load_seconds if was_cold else 0.0,
            "gpu": config.QWEN_GPU,
            "prompt": prompt,
        }
