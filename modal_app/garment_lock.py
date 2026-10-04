"""Put back garments that Qwen recolored.

Qwen-Image-Edit re-generates the whole image, so the prompt alone cannot guarantee that
the clothes placed by Leffa keep their color. After every Qwen step the image is compared
with the step's input: a garment whose average color moved more than
config.QWEN_COLOR_LOCK_THRESHOLD is pasted back from the input, wherever it is still
visible (a pixel that became a shoe, a bag, ... is left to Qwen).
"""
import cv2
import numpy as np
from PIL import Image

import config


def restore_recolored(before, after, parse_before, parse_after, label_map: dict, skip=()):
    """before/after: RGB PIL images of the same size. parse_*: human-parsing label arrays
    (any size, same for both). skip: labels this step may repaint.
    Returns (image, names of the restored garments)."""
    a = np.asarray(before, np.float32)
    b = np.asarray(after, np.float32)
    small = (parse_before.shape[1], parse_before.shape[0])
    small_a = cv2.resize(a, small, interpolation=cv2.INTER_AREA)
    small_b = cv2.resize(b, small, interpolation=cv2.INTER_AREA)

    mask = np.zeros(parse_before.shape, np.float32)
    restored = []
    for name in config.LOCKED_GARMENT_LABELS:
        if name in skip:
            continue
        region = (parse_before == label_map[name]) & (parse_after == label_map[name])
        if region.sum() < config.QWEN_COLOR_LOCK_MIN_PIXELS:
            continue
        shift = np.abs(small_a[region].mean(axis=0) - small_b[region].mean(axis=0)).max()
        if shift > config.QWEN_COLOR_LOCK_THRESHOLD:
            mask[region] = 1.0
            restored.append(name)
    if not restored:
        return after, []

    # stay off the garment's edge (Qwen's output is not pixel-aligned) and feather the seam
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8))
    mask = cv2.resize(mask, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_LINEAR)
    mask = cv2.GaussianBlur(mask, (0, 0), 3)[..., None]
    out = b * (1.0 - mask) + a * mask
    return Image.fromarray(out.clip(0, 255).astype(np.uint8)), restored
