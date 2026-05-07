#!/usr/bin/env python3
"""Generate Kala Apple Wallet pass assets.

Outputs (all in public/ and wallet-assets/apple-pass/):
- icon.png variants 29/58/87  (wallet-icon-{mixto,jumping,pilates,event}{,@2x,@3x}.png)
- logo.png  variants 160x50/320x100/480x150 wide, transparent bg
            (wallet-logo{,@2x,@3x}.png and wallet-logo-black{,@2x,@3x}.png)
- strip.png variants 375x123/750x246/1125x369
            (wallet-strip-mixto{,@2x,@3x}.png + jumping/pilates copies)

Source: icono kala.png + logo kala.png at project root.
"""
from __future__ import annotations

import os
import sys
import math
from PIL import Image, ImageDraw, ImageFilter

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_LOGO = os.path.join(ROOT, "logo kala.png")
SRC_ICON = os.path.join(ROOT, "icono kala.png")
PUBLIC = os.path.join(ROOT, "public")
WALLET = os.path.join(ROOT, "wallet-assets", "apple-pass")

# ── Brand palette ──────────────────────────────────────────────
CREAM = (255, 247, 242)
INK = (46, 32, 28)
BERRY = (118, 33, 77)
CORAL = (233, 116, 95)
OLIVE = (119, 132, 85)
ORANGE = (245, 138, 36)
BLUSH = (252, 230, 225)
BORDER = (232, 202, 193)


def cream_to_alpha(img: Image.Image, threshold: int = 22) -> Image.Image:
    """Convert near-cream pixels to transparent. Vectorized via numpy.

    Pixels with RGB within `threshold` of CREAM become alpha=0.
    Pixels within 2*threshold get a soft alpha for anti-aliasing.
    Pixels far from cream keep full alpha (255).
    """
    img = img.convert("RGBA")
    arr = np.array(img, dtype=np.int16)  # signed for diffs
    diff = np.abs(arr[..., :3] - np.array(CREAM, dtype=np.int16)).max(axis=-1)
    # Distance map: 0 = exactly cream; bigger = more saturated ink
    alpha = np.where(
        diff < threshold,
        0,
        np.where(
            diff < threshold * 2,
            ((diff - threshold) * 255 // threshold).astype(np.int16),
            255,
        ),
    ).clip(0, 255).astype(np.uint8)
    arr[..., 3] = alpha
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def trim_alpha(img: Image.Image, padding: int = 0) -> Image.Image:
    """Trim transparent borders, optionally re-add padding around content."""
    img = img.convert("RGBA")
    bbox = img.getbbox()
    if bbox is None:
        return img
    cropped = img.crop(bbox)
    if padding <= 0:
        return cropped
    w, h = cropped.size
    out = Image.new("RGBA", (w + 2 * padding, h + 2 * padding), (0, 0, 0, 0))
    out.paste(cropped, (padding, padding), cropped)
    return out


def fit_into(img: Image.Image, target_w: int, target_h: int, pad_ratio: float = 0.08) -> Image.Image:
    """Scale `img` to fit `target_w x target_h` keeping aspect, with optional pad ratio of the box."""
    img = img.convert("RGBA")
    avail_w = int(target_w * (1 - 2 * pad_ratio))
    avail_h = int(target_h * (1 - 2 * pad_ratio))
    src_w, src_h = img.size
    scale = min(avail_w / src_w, avail_h / src_h)
    new_w = max(1, int(src_w * scale))
    new_h = max(1, int(src_h * scale))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    canvas.paste(resized, ((target_w - new_w) // 2, (target_h - new_h) // 2), resized)
    return canvas


def make_strip(width: int, height: int) -> Image.Image:
    """Strip image: cream textured bg + K mark left + three concentric rings right.

    Rings are drawn at 100% (full circles) representing the three Kala rings
    (Constancia berry inner, Esfuerzo olive middle, Conexión orange outer).
    The K mark on the left echoes the brand identity.
    """
    img = Image.new("RGB", (width, height), CREAM)

    # Soft blush gradient overlay (top-right wash, fading to cream).
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    cx = width * 0.85
    cy = height * 0.20
    max_r = math.hypot(width, height)
    # Render gradient as concentric ellipses with decreasing alpha.
    steps = 60
    for i in range(steps, 0, -1):
        t = i / steps
        r = int(t * max_r * 0.7)
        a = int((1 - t) * 60)  # max ~60 alpha at center
        if a <= 0:
            continue
        od.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            fill=(BLUSH[0], BLUSH[1], BLUSH[2], a),
        )
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=max(2, width / 60)))
    img.paste(overlay, (0, 0), overlay)

    # Hairline divider between K and rings (very subtle).
    draw = ImageDraw.Draw(img, "RGBA")
    div_x = int(width * 0.36)
    pad_y = int(height * 0.18)
    draw.line(
        [(div_x, pad_y), (div_x, height - pad_y)],
        fill=(*INK, 30),
        width=max(1, int(width / 375)),
    )

    # ── K mark left ──────────────────────────────────────────────
    src_icon = Image.open(SRC_ICON).convert("RGBA")
    src_icon = cream_to_alpha(src_icon)
    src_icon = trim_alpha(src_icon)
    target_icon_h = int(height * 0.62)
    sw, sh = src_icon.size
    scale = target_icon_h / sh
    tw = int(sw * scale)
    icon_resized = src_icon.resize((tw, target_icon_h), Image.LANCZOS)
    ix = int(width * 0.07)
    iy = (height - target_icon_h) // 2
    img.paste(icon_resized, (ix, iy), icon_resized)

    # ── Three concentric rings on the right ──────────────────────
    # Centered at right-third midpoint, radii in proportion to height.
    rcx = int(width * 0.74)
    rcy = int(height * 0.50)
    base = height
    radii = [int(base * 0.18), int(base * 0.30), int(base * 0.42)]  # inner→outer
    colors = [BERRY, OLIVE, ORANGE]
    stroke = max(2, int(base * 0.045))

    for r, color in zip(radii, colors):
        # Draw the full ring with the brand stroke. Use multiple ellipses
        # for crisper stroke control (PIL's ImageDraw.ellipse stroke is fine).
        bbox = (rcx - r, rcy - r, rcx + r, rcy + r)
        # Soft track behind (lower opacity same color, slightly wider stroke)
        draw.ellipse(
            bbox,
            outline=(*color, 60),
            width=stroke + 2,
        )
        draw.ellipse(
            bbox,
            outline=color,
            width=stroke,
        )

    # Tiny center dot (ink, very subtle)
    dot = max(1, int(base * 0.018))
    draw.ellipse(
        (rcx - dot, rcy - dot, rcx + dot, rcy + dot),
        fill=(*INK, 90),
    )

    # Optional: add three tiny color tags below the rings, indicating which is which.
    # Skipped to keep the strip clean. Apple users learn the order over time.

    return img


def save_png(img: Image.Image, path: str, optimize: bool = True) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=optimize)
    print(f"  ✓ {os.path.relpath(path, ROOT)}  ({img.size[0]}x{img.size[1]})")


def main() -> int:
    print(f"ROOT: {ROOT}")
    if not (os.path.exists(SRC_LOGO) and os.path.exists(SRC_ICON)):
        print("❌ Source assets not found at project root.", file=sys.stderr)
        return 1

    # ── 1. ICON variants (29/58/87) with alpha ──
    print("\n── Icon variants (transparent) ──")
    src_icon_full = Image.open(SRC_ICON).convert("RGBA")
    src_icon_alpha = cream_to_alpha(src_icon_full)
    src_icon_alpha = trim_alpha(src_icon_alpha, padding=int(src_icon_alpha.size[0] * 0.05))

    icon_sizes = [(29, ""), (58, "@2x"), (87, "@3x")]
    icon_categories = ["mixto", "jumping", "pilates", "event"]

    for size, suffix in icon_sizes:
        icon = src_icon_alpha.resize((size, size), Image.LANCZOS)
        for cat in icon_categories:
            for outdir in (PUBLIC, WALLET):
                save_png(icon, os.path.join(outdir, f"wallet-icon-{cat}{suffix}.png"))

    # Thumbnails (used as side-of-pass thumbnails by Apple): square, larger sizes
    print("\n── Thumbnail variants ──")
    for size, suffix in [(90, ""), (180, "@2x")]:
        thumb = src_icon_alpha.resize((size, size), Image.LANCZOS)
        for cat in ("mixto", "event"):
            for outdir in (PUBLIC, WALLET):
                save_png(thumb, os.path.join(outdir, f"wallet-thumb-{cat}{suffix}.png"))

    # Replace ophelia-logo.png anchor (used by findAssetDir) with Kala icon at higher res
    print("\n── Anchor (ophelia-logo.png replaced by Kala) ──")
    anchor_icon = src_icon_alpha.resize((200, 200), Image.LANCZOS)
    save_png(anchor_icon, os.path.join(PUBLIC, "ophelia-logo.png"))
    save_png(src_icon_alpha.resize((400, 400), Image.LANCZOS),
             os.path.join(PUBLIC, "ophelia-logo-full.png"))

    # ── 2. LOGO wide variants (160x50 ratio) with alpha ──
    print("\n── Logo wide (transparent, 160x50 ratio) ──")
    src_logo_full = Image.open(SRC_LOGO).convert("RGBA")
    src_logo_alpha = cream_to_alpha(src_logo_full, threshold=24)
    src_logo_alpha = trim_alpha(src_logo_alpha, padding=int(src_logo_alpha.size[0] * 0.02))

    logo_sizes = [(160, 50, ""), (320, 100, "@2x"), (480, 150, "@3x")]
    for w, h, suffix in logo_sizes:
        # Slightly less padding to maximize wordmark size in available box
        logo = fit_into(src_logo_alpha, w, h, pad_ratio=0.04)
        for outdir in (PUBLIC, WALLET):
            save_png(logo, os.path.join(outdir, f"wallet-logo{suffix}.png"))
            save_png(logo, os.path.join(outdir, f"wallet-logo-black{suffix}.png"))

    # ── 3. STRIP variants (375x123 + retina) ──
    print("\n── Strip variants (375x123 ratio) ──")
    strip_sizes = [(375, 123, ""), (750, 246, "@2x"), (1125, 369, "@3x")]
    for w, h, suffix in strip_sizes:
        strip = make_strip(w, h)
        for outdir in (PUBLIC, WALLET):
            for cat in ("mixto", "jumping", "pilates"):
                save_png(strip, os.path.join(outdir, f"wallet-strip-{cat}{suffix}.png"))

    # ── 4. Google Wallet program/hero (already updated earlier, regenerate clean) ──
    print("\n── Google Wallet program logo + hero ──")
    save_png(src_icon_alpha.resize((660, 660), Image.LANCZOS),
             os.path.join(PUBLIC, "wallet-program-black.png"))
    save_png(src_icon_alpha.resize((660, 660), Image.LANCZOS),
             os.path.join(PUBLIC, "wallet-program-event.png"))
    # Hero: place wordmark on cream 1032x344 (3:1)
    hero = Image.new("RGB", (1032, 344), CREAM)
    hero_logo = fit_into(src_logo_alpha, 1032, 344, pad_ratio=0.18)
    hero.paste(hero_logo, (0, 0), hero_logo)
    save_png(hero, os.path.join(PUBLIC, "wallet-hero-black.png"))
    save_png(hero, os.path.join(PUBLIC, "wallet-hero-event.png"))

    print("\n✅ Done. All assets generated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
