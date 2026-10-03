"""Leffa virtual try-on engine for OOTD-Lab (drop-in alternative to FASHN).

Needs a local clone of Leffa with the mask/fine-tune patch applied
(leffa_utils/mask_fix.py must exist) and its ./ckpts downloaded:

  git clone https://github.com/franciszzj/Leffa.git
  cd Leffa && git apply ../leffa_finetune.patch
  python -c "from huggingface_hub import snapshot_download; snapshot_download('franciszzj/Leffa', local_dir='./ckpts')"

Env vars (read by server.py):
  LEFFA_DIR       path to the Leffa repo            (default ./Leffa)
  LEFFA_DC_CKPT   fine-tuned DressCode weights .pth (default <LEFFA_DIR>/ckpts/virtual_tryon_dc.pth)
  LEFFA_TOP_MODEL viton_hd | dress_code, model used for Atasan (default viton_hd)
  LEFFA_STEPS     denoising steps (default 30)
"""
import os
import re
import sys

import numpy as np
from PIL import Image

# OOTD-Lab category -> Leffa garment type
CATEGORY_MAP = {"Atasan": "upper_body", "Bawahan": "lower_body", "Terusan": "dresses"}
# apply bottoms/dresses first, tops last (same order as the FASHN path)
ORDER = {"lower_body": 0, "dresses": 0, "upper_body": 1}

_LENGTH_RULES = [  # first match wins; checked against "subCategory name"
    (r"\b(mini|pendek|short|shorts|jorts|hot ?pants)\b", "mini"),
    (r"\b(midi|7/8|kulot|culotte)\b", "midi"),
    (r"\b(maxi|panjang|long|jeans|trousers|sweatpants|track|jogger|cargo|chino|gamis|abaya|palazzo|kaftan)\b", "ankle"),
    (r"\b(rok|skirt|dress|terusan|selutut|knee)\b", "knee"),
]
_FLARE_RULES = [
    (r"\b(flare|flared|a-?line|plisket|pleated|tutu|ruffle|mengembang|lebar|wide|palazzo|kulot|culotte|ballgown)\b", 0.45),
    (r"\b(rok|skirt|dress|terusan|gamis|abaya)\b", 0.25),
]


def garment_shape(category: str, sub_category: str = "", name: str = ""):
    """(garment_length, flare) for the TARGET garment, from closet metadata.
    Returns (None, 0.0) for tops: their mask comes from the torso."""
    if CATEGORY_MAP.get(category) == "upper_body":
        return None, 0.0
    text = f"{sub_category} {name}".lower()
    length = next((v for pat, v in _LENGTH_RULES if re.search(pat, text)), None)
    flare = next((v for pat, v in _FLARE_RULES if re.search(pat, text)), 0.0)
    return length, flare


class LeffaEngine:
    def __init__(self, leffa_dir=None, dc_ckpt=None, top_model=None, steps=None):
        self.dir = os.path.abspath(leffa_dir or os.environ.get("LEFFA_DIR", "./Leffa"))
        if not os.path.exists(os.path.join(self.dir, "leffa_utils", "mask_fix.py")):
            raise RuntimeError(f"{self.dir} is not a patched Leffa repo (leffa_utils/mask_fix.py missing).")
        sys.path.insert(0, self.dir)
        ck = os.path.join(self.dir, "ckpts")
        self.top_model = top_model or os.environ.get("LEFFA_TOP_MODEL", "viton_hd")
        self.steps = int(steps or os.environ.get("LEFFA_STEPS", 30))

        from leffa.inference import LeffaInference
        from leffa.model import LeffaModel
        from leffa.transform import LeffaTransform
        from leffa_utils.densepose_predictor import DensePosePredictor
        from leffa_utils.mask_fix import get_agnostic_mask_v2
        from leffa_utils.utils import resize_and_center
        from preprocess.humanparsing.run_parsing import Parsing
        from preprocess.openpose.run_openpose import OpenPose

        self._mask_fn, self._resize, self._transform = get_agnostic_mask_v2, resize_and_center, LeffaTransform()
        self.parsing = Parsing(atr_path=f"{ck}/humanparsing/parsing_atr.onnx",
                               lip_path=f"{ck}/humanparsing/parsing_lip.onnx")
        self.openpose = OpenPose(body_model_path=f"{ck}/openpose/body_pose_model.pth")
        self.densepose = DensePosePredictor(config_path=f"{ck}/densepose/densepose_rcnn_R_50_FPN_s1x.yaml",
                                            weights_path=f"{ck}/densepose/model_final_162be9.pkl")
        base = f"{ck}/stable-diffusion-inpainting"
        dc = dc_ckpt or os.environ.get("LEFFA_DC_CKPT") or f"{ck}/virtual_tryon_dc.pth"
        self.models = {"dress_code": LeffaInference(LeffaModel(base, dc, dtype="float16"))}
        if self.top_model == "viton_hd":
            self.models["viton_hd"] = LeffaInference(LeffaModel(base, f"{ck}/virtual_tryon.pth", dtype="float16"))

    def _one(self, person: Image.Image, garment: Image.Image, garment_type: str,
             length=None, flare=0.0, seed=42) -> Image.Image:
        model_type = self.top_model if garment_type == "upper_body" else "dress_code"
        person = self._resize(person, 768, 1024).convert("RGB")
        garment = self._resize(garment, 768, 1024).convert("RGB")
        small = person.resize((384, 512))
        parse, _ = self.parsing(small)
        kp = self.openpose(small)
        mask = self._mask_fn(parse, kp, garment_type, model_type=model_type,
                             garment_length=length, flare=flare).resize((768, 1024))
        arr = np.array(person)
        if model_type == "viton_hd":
            dp = Image.fromarray(self.densepose.predict_seg(arr)[:, :, ::-1])
        else:
            iuv = self.densepose.predict_iuv(arr)
            dp = Image.fromarray(np.concatenate([iuv[:, :, 0:1]] * 3, axis=-1))
        data = self._transform({"src_image": [person], "ref_image": [garment], "mask": [mask], "densepose": [dp]})
        out = self.models[model_type](data, num_inference_steps=self.steps, guidance_scale=2.5, seed=seed)
        return out["generated_image"][0]

    def dress(self, person: Image.Image, garments: list) -> Image.Image:
        """garments: [{"category", "subCategory", "name", "image": PIL.Image}, ...]"""
        jobs = []
        for g in garments:
            gtype = CATEGORY_MAP.get(g.get("category"))
            if gtype and g.get("image") is not None:
                length, flare = garment_shape(g["category"], g.get("subCategory", ""), g.get("name", ""))
                jobs.append((ORDER[gtype], gtype, length, flare, g["image"]))
        if not jobs:
            raise ValueError("No supported garments selected.")
        for _, gtype, length, flare, img in sorted(jobs, key=lambda j: j[0]):
            person = self._one(person, img, gtype, length, flare)
        return person
