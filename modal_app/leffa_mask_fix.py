"""Category-aware mask fixes for Leffa virtual try-on.

Leffa has NO category conditioning: cross-attention is removed, and the only
signal for "where on the body" is the inpainting mask. Wrong placement is
almost always a mask problem, not a weights problem.

Fixes on top of leffa_utils.utils.get_agnostic_mask_{hd,dc}:
1. DressCode lower_body ignores the parsing label "skirt" (5), so a person who
   is wearing a skirt keeps it and the new garment can't replace it.
2. Mask is built from the clothes the person is CURRENTLY wearing. Putting a
   long/flared skirt on someone in slim pants (or long pants on someone in a
   mini skirt) leaves the mask too small, so the garment gets squeezed or
   placed wrong. `garment_length` extends the mask using hip/knee/ankle
   keypoints to the length of the TARGET garment.
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw

from leffa_utils.utils import get_agnostic_mask_dc, get_agnostic_mask_hd, label_map

# OpenPose-18 indices
R_HIP, R_KNEE, R_ANKLE, L_HIP, L_KNEE, L_ANKLE = 8, 9, 10, 11, 12, 13
R_SHOULDER, L_SHOULDER = 2, 5

LOWER_LENGTHS = ("mini", "knee", "midi", "ankle")  # short skirt/shorts -> long skirt/pants


def _pt(pose, i):
    p = pose[i]
    return None if (p[0] <= 1.0 and p[1] <= 1.0) else (float(p[0]), float(p[1]))


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _leg_end(hip, knee, ankle, length):
    """Point down the leg where the garment ends."""
    if length == "mini":
        return _lerp(hip, knee, 0.55) if knee else None
    if length == "knee":
        return knee
    if length == "midi":
        return _lerp(knee, ankle, 0.5) if (knee and ankle) else knee
    return ankle or knee  # ankle


def _extension_region(pose, category, length, flare, size):
    w, h = size
    canvas = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(canvas)
    rh, lh = _pt(pose, R_HIP), _pt(pose, L_HIP)
    if not (rh and lh):
        return np.zeros((h, w), np.float32)

    rend = _leg_end(rh, _pt(pose, R_KNEE), _pt(pose, R_ANKLE), length)
    lend = _leg_end(lh, _pt(pose, L_KNEE), _pt(pose, L_ANKLE), length)
    if not (rend and lend):
        return np.zeros((h, w), np.float32)

    hip_w = abs(lh[0] - rh[0])
    pad = hip_w * 0.35  # cover the hip flesh outside the joint points
    top_y = min(rh[1], lh[1]) - hip_w * 0.35  # up to the waist
    if category == "dresses":
        rs, ls = _pt(pose, R_SHOULDER), _pt(pose, L_SHOULDER)
        if rs and ls:
            top_y = min(rs[1], ls[1])

    left_x, right_x = min(rh[0], lh[0]) - pad, max(rh[0], lh[0]) + pad
    bottom_y = max(rend[1], lend[1])
    # flare > 0 widens the hem (A-line / flared skirts and dresses)
    spread = hip_w * flare
    hem_l = min(rend[0], lend[0]) - pad - spread
    hem_r = max(rend[0], lend[0]) + pad + spread
    draw.polygon([(left_x, top_y), (right_x, top_y), (hem_r, bottom_y), (hem_l, bottom_y)], fill=255)
    return np.array(canvas, np.float32) / 255.0


def get_agnostic_mask_v2(model_parse, keypoint, category, model_type="dress_code",
                         garment_length=None, flare=0.0, size=(384, 512)):
    """Drop-in replacement for get_agnostic_mask_{hd,dc}.

    category: "upper_body" | "lower_body" | "dresses"
    garment_length: None (old behaviour) or one of LOWER_LENGTHS, for the TARGET garment
    flare: 0.0 = straight (pants, pencil skirt) ... 0.6 = very flared skirt/dress
    """
    base_fn = get_agnostic_mask_dc if model_type == "dress_code" else get_agnostic_mask_hd
    mask = np.array(base_fn(model_parse, keypoint, category, size=size)).astype(np.float32) / 255.0
    if mask.ndim == 3:
        mask = mask[..., 0]

    parse = np.array(model_parse)
    pose = np.array(keypoint["pose_keypoints_2d"], dtype=np.float32).reshape(-1, 2)
    dil = np.ones((10, 10), np.uint8)

    add = np.zeros_like(mask)
    if category in ("lower_body", "dresses"):
        # Fix 1: current skirt / pants / dress must always be replaceable
        cur = np.isin(parse, [label_map["skirt"], label_map["pants"]]).astype(np.float32)
        if category == "dresses":
            cur += (parse == label_map["dress"])
        add = np.maximum(add, cv2.dilate(cur, dil, iterations=3))
        # Fix 2: extend to the target garment's length/shape
        if garment_length is not None:
            assert garment_length in LOWER_LENGTHS, garment_length
            add = np.maximum(add, _extension_region(pose, category, garment_length, flare, size))

    # never paint over things that must stay
    keep = np.isin(parse, [label_map["head"], label_map["hair"], label_map["left_shoe"],
                           label_map["right_shoe"], label_map["bag"], label_map["hat"]])
    if category == "lower_body":
        keep |= np.isin(parse, [label_map["upper_clothes"], label_map["left_arm"], label_map["right_arm"]])
    add[keep] = 0

    out = np.clip(mask + add, 0, 1)
    return Image.fromarray((out > 0.5).astype(np.uint8) * 255)
