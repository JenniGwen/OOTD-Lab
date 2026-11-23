"""Put back garments that Qwen recolored.

Qwen-Image-Edit re-generates the whole image, so the prompt alone cannot guarantee that
the clothes placed by Leffa keep their color. After every Qwen step the image is compared
with the step's input: a garment whose average color moved more than
config.QWEN_COLOR_LOCK_THRESHOLD is pasted back from the input, wherever it is still
visible (a pixel that became a shoe, a bag, ... is left to Qwen).

The parser often labels part of a new bag or strap drawn over the top as "upper_clothes",
so pixels whose local color changed a lot (something new was drawn there) are left out of
both the color check and the paste-back. Only when that covers most of the garment is it
treated as a recolor of the whole garment and restored in full.
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

    # Local average color (blurred past stripes and small misalignment): a uniform drift
    # changes it a little, a new object drawn on top changes it a lot.
    local_diff = np.abs(cv2.GaussianBlur(small_a, (0, 0), 4) - cv2.GaussianBlur(small_b, (0, 0), 4)).max(axis=2)
    new_object = cv2.dilate((local_diff > config.QWEN_COLOR_LOCK_NEW_OBJECT).astype(np.uint8),
                            np.ones((7, 7), np.uint8)).astype(bool)
    # A dark bag on a dark top barely changes the color, so also trust the parser: where
    # the label changed (garment -> bag, ...), plus a margin for the edge it misparsed.
    garments = [label_map[name] for name in config.LOCKED_GARMENT_LABELS]
    added = ~np.isin(parse_after, garments) & (parse_after != parse_before) & (parse_after != 0)
    margin = config.QWEN_COLOR_LOCK_NEW_OBJECT_MARGIN
    new_object |= cv2.dilate(added.astype(np.uint8), np.ones((margin, margin), np.uint8)).astype(bool)

    mask = np.zeros(parse_before.shape, np.float32)
    restored = []
    for name in config.LOCKED_GARMENT_LABELS:
        if name in skip:
            continue
        region = (parse_before == label_map[name]) & (parse_after == label_map[name])
        if region.sum() < config.QWEN_COLOR_LOCK_MIN_PIXELS:
            continue
        untouched = region & ~new_object
        if untouched.sum() >= config.QWEN_COLOR_LOCK_WHOLE_RECOLOR * region.sum():
            region = untouched  # leave what was drawn on top of the garment alone
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
