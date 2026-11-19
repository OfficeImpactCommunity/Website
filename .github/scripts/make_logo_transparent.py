#!/usr/bin/env python3
"""Create a transparent PNG from the legacy white-background Office Impact logo.

The original JPEG is kept unchanged. The script estimates the background from
its four corners and converts the white matte into an alpha channel.
"""
from pathlib import Path
from PIL import Image
import numpy as np

SOURCE = Path("media/OLD_office-impact-logo.jpg")
DESTINATION = Path("media/office-impact-logo.png")

image = Image.open(SOURCE).convert("RGB")
pixels = np.asarray(image, dtype=np.float32)
height, width, _ = pixels.shape

# Estimate the paper/background tone from small patches in all four corners.
patch = max(4, min(width, height) // 40)
corners = np.concatenate(
    [
        pixels[:patch, :patch].reshape(-1, 3),
        pixels[:patch, -patch:].reshape(-1, 3),
        pixels[-patch:, :patch].reshape(-1, 3),
        pixels[-patch:, -patch:].reshape(-1, 3),
    ],
    axis=0,
)
background = np.median(corners, axis=0)

# Alpha is calculated against the light background. The minimum channel
# tracks how much dark logo ink is present, including anti-aliased edges.
safe_background = np.maximum(background, 1.0)
ratios = pixels / safe_background
alpha = 1.0 - np.clip(np.min(ratios, axis=2), 0.0, 1.0)

# Decontaminate the original background colour from partially transparent
# edge pixels, preventing a pale rectangle/halo on the website's warm paper.
a = alpha[..., None]
foreground = np.where(
    a > 0.015,
    (pixels - background[None, None, :] * (1.0 - a)) / np.maximum(a, 0.015),
    0.0,
)
foreground = np.clip(foreground, 0, 255)

# Remove JPEG noise in the background while preserving soft logo edges.
alpha[alpha < 0.025] = 0.0

rgba = np.dstack([foreground, alpha * 255.0]).round().astype(np.uint8)
Image.fromarray(rgba, mode="RGBA").save(DESTINATION, optimize=True)

transparent = int(np.count_nonzero(rgba[..., 3] == 0))
print(
    f"Created {DESTINATION}: {width}x{height}px, "
    f"background={background.round(1).tolist()}, "
    f"transparent_pixels={transparent}/{width*height}"
)
