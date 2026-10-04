"""All tunable constants for the OOTD-Lab hybrid try-on pipeline on Modal.

Edit this file only; the other modules read everything from here.
"""
import math
import re

# ---------------------------------------------------------------- app / infra
APP_NAME = "ootd-tryon"

# Modal Volumes (persisted by name) and where they are mounted.
HF_CACHE_VOLUME = "hf-cache"
LEFFA_CKPT_VOLUME = "leffa-ckpts"
RESULTS_VOLUME = "tryon-results"
HF_CACHE_DIR = "/cache"
HF_HOME = f"{HF_CACHE_DIR}/hf"
LEFFA_REPO_DIR = "/opt/Leffa"
LEFFA_CKPT_DIR = f"{LEFFA_REPO_DIR}/ckpts"  # Leffa expects ./ckpts inside its repo
RESULTS_DIR = "/results"

JOBS_DICT = "ootd-tryon-jobs"  # modal.Dict holding JobStatus per job_id

# Seconds a container stays warm after its last request. Idle GPU time is billed,
# so keep this low; raise it only for demos where you want warm containers.
SCALEDOWN_WINDOW = 60
WEB_SCALEDOWN_WINDOW = 300  # CPU-only web/UI container, cheap to keep warm
# Cap on parallel GPU containers per engine (Starter plan allows 10 GPUs total).
LEFFA_MAX_CONTAINERS = 1
QWEN_MAX_CONTAINERS = 1

# ---------------------------------------------------------------- pricing (USD / second)
# Checked against modal.com/pricing on 2026-10-03. Do not pin a region: 1.15-1.75x.
PRICE_GPU = {"H100": 0.001097, "L40S": 0.000542}
PRICE_CPU_CORE = 0.0000131
PRICE_MEM_GIB = 0.00000222

# ---------------------------------------------------------------- categories
CATEGORIES = ["atasan", "bawahan", "dress", "luaran", "alas", "aksesoris", "unknown"]
# Order garments are put on. A dress replaces atasan + bawahan.
CATEGORY_ORDER = ["atasan", "dress", "bawahan", "luaran", "alas", "aksesoris"]
# Only one garment per slot for these; extra items are skipped with a warning.
SINGLE_SLOT_CATEGORIES = ["atasan", "dress", "bawahan", "luaran", "alas"]
ENGINE_BY_CATEGORY = {
    "atasan": "leffa",
    "bawahan": "leffa",
    "dress": "leffa",
    # Leffa only knows upper body / lower body / dress. Everything else goes to Qwen,
    # which works out from the garment photo how the item is worn.
    "luaran": "qwen",
    "alas": "qwen",
    "aksesoris": "qwen",
    "unknown": "qwen",  # runs last, with a generic prompt
}
# Leffa turns a skirt into trousers when the person in the photo wears trousers, so
# skirts go to Qwen as well.
QWEN_BAWAHAN_SUBTYPES = r"\b(skirt|rok)\b"


def engine_for(category: str, subtype: str = "") -> str:
    if category == "bawahan" and re.search(QWEN_BAWAHAN_SUBTYPES, (subtype or "").lower()):
        return "qwen"
    return ENGINE_BY_CATEGORY[category]


MAX_ITEMS_PER_JOB = 8
MAX_IMAGE_BYTES = 15 * 1024 * 1024

# Working resolution of the whole chain (Leffa's native size).
WORK_WIDTH = 768
WORK_HEIGHT = 1024

# ---------------------------------------------------------------- Leffa (L40S)
LEFFA_GPU = "L40S"
LEFFA_CPU = 2.0
LEFFA_MEMORY_MIB = 16384
LEFFA_REPO_URL = "https://github.com/franciszzj/Leffa.git"
LEFFA_REPO_COMMIT = "05a259104b6927607776c7edb3e86b75406f20aa"  # main @ 2025-09-12
LEFFA_HF_REPO = "franciszzj/Leffa"
# pose_transfer.pth (20 GB), the SDXL configs, SCHP and examples are not needed for try-on.
LEFFA_DOWNLOAD_PATTERNS = [
    "virtual_tryon.pth",
    "virtual_tryon_dc.pth",
    "stable-diffusion-inpainting/*",
    "densepose/*",
    "humanparsing/*",
    "openpose/*",
]
# category -> (Leffa garment type, model type). viton_hd = virtual_tryon.pth,
# dress_code = virtual_tryon_dc.pth.
LEFFA_CATEGORY = {
    "atasan": ("upper_body", "viton_hd"),
    "bawahan": ("lower_body", "dress_code"),
    "dress": ("dresses", "dress_code"),
}
LEFFA_STEPS = 30
LEFFA_GUIDANCE_SCALE = 2.5
LEFFA_SEED = 42

# ---------------------------------------------------------------- Qwen-Image-Edit (H100)
QWEN_GPU = "H100"
QWEN_CPU = 2.0
QWEN_MEMORY_MIB = 32768
QWEN_MODEL_ID = "Qwen/Qwen-Image-Edit-2509"
QWEN_LIGHTNING_REPO = "lightx2v/Qwen-Image-Lightning"
QWEN_LIGHTNING_STEPS = 8  # 4 or 8; picks the matching LoRA file below
QWEN_LIGHTNING_FILES = {
    4: "Qwen-Image-Edit-2509/Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors",
    8: "Qwen-Image-Edit-2509/Qwen-Image-Edit-2509-Lightning-8steps-V1.0-bf16.safetensors",
}
QWEN_DEFAULT_MODE = "lightning"
QWEN_MODES = {
    "lightning": {"steps": QWEN_LIGHTNING_STEPS, "true_cfg_scale": 1.0},
    "standard": {"steps": 40, "true_cfg_scale": 4.0},
}
QWEN_NEGATIVE_PROMPT = " "
# Generation size: what diffusers' calculate_dimensions(1024*1024, 768/1024) gives, i.e.
# the size the pipeline encodes the 768x1024 person image at. The result is resized
# back to WORK_WIDTH x WORK_HEIGHT.
QWEN_WIDTH = 896
QWEN_HEIGHT = 1184
QWEN_SEED = 0
# Scheduler used with the Lightning LoRA, copied from
# github.com/ModelTC/Qwen-Image-Lightning generate_with_diffusers.py (shift=3 distillation).
QWEN_LIGHTNING_SCHEDULER = {
    "base_image_seq_len": 256,
    "base_shift": math.log(3),
    "invert_sigmas": False,
    "max_image_seq_len": 8192,
    "max_shift": math.log(3),
    "num_train_timesteps": 1000,
    "shift": 1.0,
    "shift_terminal": None,
    "stochastic_sampling": False,
    "time_shift_type": "exponential",
    "use_beta_sigmas": False,
    "use_dynamic_shifting": True,
    "use_exponential_sigmas": False,
    "use_karras_sigmas": False,
}

# Qwen re-generates the whole image, so the prompt has to pin down everything that must
# not change. The prompts never name the item: Qwen sees it in image 2 and works out what
# it is and how it is worn (a wrong name, e.g. "sandals" for clogs, makes it ignore the photo).
# Do not list items that are not in the outfit (not even as "no hat"): naming them makes
# the model add them.
_QWEN_MATCH = "It must match image 2 exactly: same type, color, pattern, material and shape. "
_QWEN_KEEP = (
    "Keep everything else exactly as in image 1: the same face, hair, body, pose, the same "
    "colors of all other clothing, the same background and framing. Do not add any other item."
)
QWEN_PROMPTS = {
    "bawahan": (
        "Replace the lower-body garment the person in image 1 is wearing with the garment from "
        "image 2, worn at the waist. Remove the old lower-body garment completely: where the "
        "new garment does not cover the legs, show bare legs. "
        + _QWEN_MATCH + "Keep its length as in image 2. " + _QWEN_KEEP
    ),
    "luaran": (
        "Dress the person in image 1 in the outer garment from image 2, worn over the top they "
        "already wear. " + _QWEN_MATCH + _QWEN_KEEP
    ),
    "alas": (
        "Put the footwear from image 2 on the feet of the person in image 1, replacing the "
        "footwear they currently wear. " + _QWEN_MATCH + _QWEN_KEEP
    ),
    "aksesoris": (
        "Add the accessory from image 2 to the person in image 1, worn or carried the way this "
        "kind of accessory normally is. Add only this one accessory. " + _QWEN_MATCH + _QWEN_KEEP
    ),
    "unknown": (
        "Put the fashion item from image 2 on the person in image 1, worn the way this kind of "
        "item normally is, replacing only what it has to cover. " + _QWEN_MATCH + _QWEN_KEEP
    ),
}

# Garments (Leffa parsing labels) that a Qwen step must not recolor, see garment_lock.py.
LOCKED_GARMENT_LABELS = ["upper_clothes", "pants", "skirt", "dress"]
# Labels a step is allowed to repaint: outerwear covers the top, and an item of unknown
# type may cover anything (None = no check).
QWEN_COLOR_LOCK_SKIP = {
    "bawahan": ["pants", "skirt", "dress"],
    "luaran": ["upper_clothes", "dress"],
    "unknown": None,
}
# Largest allowed move of a garment's average R/G/B (0-255) across one Qwen step.
QWEN_COLOR_LOCK_THRESHOLD = 12
QWEN_COLOR_LOCK_MIN_PIXELS = 200  # at parsing resolution (384x512); ignore slivers

# ---------------------------------------------------------------- classifier
# Modal Shared Endpoint (OpenAI-compatible). The URL and proxy token come from a
# Modal Secret so they never live in git:
#   modal secret create ootd-vl-endpoint VL_ENDPOINT_URL=... \
#       MODAL_PROXY_TOKEN_ID=wk-... MODAL_PROXY_TOKEN_SECRET=ws-...
VL_SECRET_NAME = "ootd-vl-endpoint"
VL_MODEL = "Qwen/Qwen3.8-Max-VL-Thinking"
VL_MAX_CONCURRENCY = 16  # workspace-wide limit of the shared endpoint
VL_TIMEOUT_SECONDS = 90
VL_MAX_TOKENS = 2048  # thinking model: leave room for reasoning before the JSON
VL_MAX_RETRIES = 4  # on HTTP 429 / 5xx, exponential backoff with jitter
VL_IMAGE_MAX_SIDE = 768  # downscale before sending to save tokens
CONFIDENCE_THRESHOLD = 0.6

CLASSIFY_PROMPT = (
    "Classify the clothing item in this image. Reply ONLY with JSON matching: "
    '{"category": one of [atasan, bawahan, dress, luaran, alas, aksesoris, unknown], '
    '"subtype": short English noun, "confidence": 0-1}. '
    "atasan=tops worn directly (shirt, t-shirt, blouse, sweater), "
    "luaran=outerwear worn over a top (jacket, blazer, coat, cardigan), bawahan=bottoms (pants, jeans, skirt, shorts), "
    "dress=one-piece dress, alas=footwear, aksesoris=bags, hats, glasses, jewelry."
)

# Fallback when the endpoint is not configured, unreachable or returns garbage.
CLIP_MODEL_ID = "patrickjohncyh/fashion-clip"
CLIP_LABELS = {
    "atasan": ["t-shirt", "shirt", "blouse", "sweater", "hoodie"],
    "luaran": ["jacket", "blazer", "cardigan", "coat"],
    "bawahan": ["pants", "jeans", "shorts", "skirt", "sweatpants"],
    "dress": ["dress", "gown", "jumpsuit"],
    "alas": ["sneakers", "shoes", "boots", "sandals", "heels"],
    "aksesoris": ["bag", "hat", "glasses", "watch", "necklace", "belt", "scarf"],
}
