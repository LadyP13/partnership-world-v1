#!/usr/bin/env python3
"""
PartnershipWorld workshop pane — first play.
Second screen presence surface.
- No camera preview (tracking only, if enabled)
- Voice stays the conversation; this is just the room
- Linux-friendly. Not Jarvis.

Run:
  python3 workshop_pane.py
  python3 workshop_pane.py --hands     # if opencv + mediapipe installed
  python3 workshop_pane.py --hands --preview   # tiny camera inset, for setup

Quit: Esc
Fullscreen toggle: Enter
Preview toggle: P
"""

from __future__ import annotations

import argparse
import datetime
import math
import os
import sys
import threading
import time
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

import pygame

HERE = Path(__file__).resolve().parent
VENV_PYTHON = HERE.parent / "venv" / "bin" / "python"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
)
MODEL_PATH = HERE / ".workshop" / "hand_landmarker.task"

# --- optional hands (never drawn as a selfie, unless --preview) ---
hands_available = False
hands_import_error = ""
mp = None
cv2 = None
np = None
HandLandmarker = None
HandLandmarkerOptions = None
RunningMode = None
BaseOptions = None


def _mp_can_hands(mod) -> bool:
    try:
        from mediapipe.tasks.python.core.base_options import BaseOptions as _BO
        from mediapipe.tasks.python.vision import HandLandmarker as _HL
        return _BO is not None and _HL is not None and hasattr(mod, "Image")
    except Exception:
        return False


def _drop_shadow_mediapipe() -> None:
    """The PW repo contains a mediapipe/ source tree. Don't import that."""
    here = str(HERE)
    cwd = os.getcwd()
    cleaned = []
    for p in sys.path:
        ap = os.path.abspath(p) if p else cwd
        if ap in (here, cwd) and (Path(ap) / "mediapipe").is_dir():
            continue
        cleaned.append(p)
    sys.path[:] = cleaned
    for name in list(sys.modules):
        if name == "mediapipe" or name.startswith("mediapipe."):
            del sys.modules[name]


def _load_hands_stack() -> None:
    global hands_available, hands_import_error
    global mp, cv2, np
    global HandLandmarker, HandLandmarkerOptions, RunningMode, BaseOptions
    try:
        import cv2 as _cv2
        import numpy as _np
        import mediapipe as _mp
        if not _mp_can_hands(_mp):
            _drop_shadow_mediapipe()
            import mediapipe as _mp
        if not _mp_can_hands(_mp):
            raise ImportError(
                "this mediapipe has no HandLandmarker "
                f"(loaded from {getattr(_mp, '__file__', _mp)})"
            )
        from mediapipe.tasks.python.core.base_options import BaseOptions as _BO
        from mediapipe.tasks.python.vision import (
            HandLandmarker as _HL,
            HandLandmarkerOptions as _HLO,
            RunningMode as _RM,
        )
        cv2 = _cv2
        np = _np
        mp = _mp
        BaseOptions = _BO
        HandLandmarker = _HL
        HandLandmarkerOptions = _HLO
        RunningMode = _RM
        hands_available = True
        hands_import_error = ""
    except Exception as e:
        hands_available = False
        hands_import_error = f"{type(e).__name__}: {e}"


_load_hands_stack()

_PW_VENV_ROOT = HERE.parent / "venv"
if (
    not hands_available
    and VENV_PYTHON.exists()
    and Path(sys.prefix).resolve() != _PW_VENV_ROOT.resolve()
    and os.environ.get("PW_PANE_REEXEC") != "1"
):
    os.environ["PW_PANE_REEXEC"] = "1"
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *sys.argv])


WARM = (232, 196, 140)       # brass / warm light
LEAF = (110, 150, 108)       # plant
INK = (14, 16, 18)           # almost-black wood night
GLOW = (255, 214, 170)
SOFT = (180, 160, 130)


wrist_xy: Optional[Tuple[float, float]] = None
pinch_xy: Optional[Tuple[float, float]] = None
pinch = False
hand_seen = False
hand_status = "off"
preview_rgb = None
show_preview = False
_lock = threading.Lock()
_stop_hands = threading.Event()


def _set_status(msg: str) -> None:
    global hand_status
    with _lock:
        changed = hand_status != msg
        hand_status = msg
    if changed:
        print(f"[hands] {msg}", flush=True)


def ensure_hand_model() -> Path:
    if MODEL_PATH.exists() and MODEL_PATH.stat().st_size > 1_000_000:
        return MODEL_PATH
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading hand model → {MODEL_PATH}")
    tmp = MODEL_PATH.with_suffix(".part")
    urllib.request.urlretrieve(MODEL_URL, tmp)
    tmp.replace(MODEL_PATH)
    return MODEL_PATH


def _pinch_from_landmarks(hand, was_pinching: bool) -> bool:
    # 0 wrist, 4 thumb tip, 8 index tip, 9 middle MCP
    wrist, thumb, index, mcp = hand[0], hand[4], hand[8], hand[9]
    scale = math.hypot(wrist.x - mcp.x, wrist.y - mcp.y) or 0.2
    dist = math.hypot(thumb.x - index.x, thumb.y - index.y)
    if was_pinching:
        return dist < 0.48 * scale
    return dist < 0.30 * scale


def hand_loop(cam_index: int = 0, want_preview: bool = False) -> None:
    global wrist_xy, pinch_xy, pinch, hand_seen, preview_rgb, show_preview
    if not hands_available:
        return
    try:
        model = ensure_hand_model()
        landmarker = HandLandmarker.create_from_options(
            HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(model)),
                running_mode=RunningMode.VIDEO,
                num_hands=1,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        )
        backend = getattr(cv2, "CAP_V4L2", 0)
        cap = cv2.VideoCapture(cam_index, backend) if backend else cv2.VideoCapture(cam_index)
        if not cap.isOpened():
            cap = cv2.VideoCapture(cam_index)
        if not cap.isOpened():
            _set_status(f"camera {cam_index} would not open")
            landmarker.close()
            return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        ok, frame = cap.read()
        if not ok or frame is None:
            _set_status(f"camera {cam_index} opened but sent no frames")
            cap.release()
            landmarker.close()
            return
        _set_status(f"camera {cam_index} open  {frame.shape[1]}x{frame.shape[0]}  looking for a hand")
        ts = 0
        fails = 0
        pinching = False
        last_seen = 0.0
        ever_seen = False
        while not _stop_hands.is_set():
            ok, frame = cap.read()
            if not ok or frame is None:
                fails += 1
                if fails > 90:
                    _set_status("camera stopped sending frames")
                    break
                time.sleep(0.02)
                continue
            fails = 0
            frame = cv2.flip(frame, 1)
            rgb = np.ascontiguousarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            ts += 33
            result = landmarker.detect_for_video(
                mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb),
                ts,
            )
            wxy = pxy = None
            p = False
            seen = bool(result.hand_landmarks)
            if seen:
                hand = result.hand_landmarks[0]
                wxy = (hand[0].x, hand[0].y)
                pinching = _pinch_from_landmarks(hand, pinching)
                p = pinching
                mid = (
                    (hand[4].x + hand[8].x) * 0.5,
                    (hand[4].y + hand[8].y) * 0.5,
                )
                pxy = mid if p else wxy
                last_seen = time.monotonic()
                ever_seen = True
                _set_status("pinch" if p else "hand")
            else:
                pinching = False
                if ever_seen and time.monotonic() - last_seen > 0.4:
                    _set_status("looking for a hand")
            small = None
            with _lock:
                do_preview = show_preview or want_preview
            if do_preview:
                small = cv2.resize(rgb, (240, 180), interpolation=cv2.INTER_AREA)
            with _lock:
                wrist_xy = wxy
                pinch_xy = pxy
                pinch = p
                hand_seen = seen
                if small is not None:
                    preview_rgb = small
        cap.release()
        try:
            landmarker.close()
        except Exception:
            pass
    except Exception as e:
        _set_status(f"tracking crashed: {type(e).__name__}: {e}")


def draw_orb(surf: pygame.Surface, cx: int, cy: int, t: float, grabbed: bool) -> None:
    pulse = 1.0 + 0.06 * math.sin(t * 2.2)
    r = int(52 * pulse)
    for i, alpha in ((r + 38, 28), (r + 18, 55), (r, 210)):
        s = pygame.Surface((i * 2, i * 2), pygame.SRCALPHA)
        colour = GLOW if grabbed else WARM
        pygame.draw.circle(s, (*colour, alpha), (i, i), i)
        surf.blit(s, (cx - i, cy - i))
    pygame.draw.circle(surf, LEAF, (cx, cy), 6)


def draw_wrist(surf: pygame.Surface, x: int, y: int, grabbing: bool) -> None:
    r = 10 if grabbing else 7
    s = pygame.Surface((r * 4, r * 4), pygame.SRCALPHA)
    pygame.draw.circle(s, (*LEAF, 70), (r * 2, r * 2), r * 2)
    pygame.draw.circle(s, (*GLOW, 220) if grabbing else (*LEAF, 220), (r * 2, r * 2), r)
    surf.blit(s, (x - r * 2, y - r * 2))


def blit_preview(surf: pygame.Surface, rgb) -> None:
    h, w = rgb.shape[:2]
    raw = pygame.image.frombuffer(rgb.tobytes(), (w, h), "RGB")
    box = raw.get_rect()
    box.bottomright = (surf.get_width() - 24, surf.get_height() - 56)
    pygame.draw.rect(surf, (40, 44, 42), box.inflate(8, 8), border_radius=6)
    surf.blit(raw, box)


def main() -> None:
    global show_preview
    parser = argparse.ArgumentParser(description="PW workshop pane")
    parser.add_argument("--hands", action="store_true", help="enable camera tracking (no preview)")
    parser.add_argument("--preview", action="store_true", help="tiny camera inset so you can see what the tracker sees")
    parser.add_argument("--cam", type=int, default=0)
    args = parser.parse_args()

    pygame.init()
    info = pygame.display.Info()
    w, h = max(info.current_w, 1280), max(info.current_h, 720)
    screen = pygame.display.set_mode((min(w, 1600), min(h, 900)), pygame.RESIZABLE)
    pygame.display.set_caption("PartnershipWorld — workshop pane")
    clock = pygame.time.Clock()
    font_lg = pygame.font.SysFont("DejaVu Sans", 64)
    font_sm = pygame.font.SysFont("DejaVu Sans", 20)

    use_hands = args.hands and hands_available
    show_preview = bool(args.preview)
    hands_thread = None
    print("=== workshop pane ===")
    print(f"python: {sys.executable}")
    print("pygame: ok")
    print(f"opencv+mediapipe: {'ok' if hands_available else 'MISSING — ' + hands_import_error}")
    print(f"hands this run: {'ON (no selfie)' if use_hands else 'OFF'}")
    if args.hands and not hands_available:
        print("Orb will idle. Install mediapipe in the same Python you use to run this.")
        print("  python3 -m venv venv && source venv/bin/activate")
        print("  pip install pygame opencv-python mediapipe numpy")
        print("  python pane/workshop_pane.py --hands")
    if use_hands:
        print("Linux does not pop a camera-permission box for OpenCV.")
        print("If the status says camera open, the camera is already yours.")
        print(f"opening camera index {args.cam} …")
        _stop_hands.clear()
        hands_thread = threading.Thread(
            target=hand_loop,
            args=(args.cam, args.preview),
            daemon=True,
        )
        hands_thread.start()

    orb_x, orb_y = screen.get_width() * 0.5, screen.get_height() * 0.52
    fullscreen = False
    running = True
    t0 = pygame.time.get_ticks()

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_RETURN:
                    fullscreen = not fullscreen
                    flags = pygame.FULLSCREEN if fullscreen else pygame.RESIZABLE
                    screen = pygame.display.set_mode(
                        (info.current_w, info.current_h) if fullscreen else (1280, 720),
                        flags,
                    )
                elif event.key == pygame.K_p and use_hands:
                    with _lock:
                        show_preview = not show_preview
            elif event.type == pygame.VIDEORESIZE and not fullscreen:
                screen = pygame.display.set_mode(event.size, pygame.RESIZABLE)

        now = datetime.datetime.now()
        t = (pygame.time.get_ticks() - t0) / 1000.0
        sw, sh = screen.get_size()

        grabbed = False
        with _lock:
            wxy, pxy, p, seen, status, prev = (
                wrist_xy, pinch_xy, pinch, hand_seen, hand_status, preview_rgb,
            )
            preview_on = show_preview
        if use_hands and p and pxy is not None:
            grabbed = True
            tx, ty = pxy[0] * sw, pxy[1] * sh
            orb_x += (tx - orb_x) * 0.25
            orb_y += (ty - orb_y) * 0.25

        orb_x = max(80, min(sw - 80, orb_x))
        orb_y = max(120, min(sh - 80, orb_y))

        screen.fill(INK)
        pygame.draw.line(screen, (40, 44, 42), (80, int(sh * 0.78)), (sw - 80, int(sh * 0.78)), 2)
        draw_orb(screen, int(orb_x), int(orb_y), t, grabbed)

        if use_hands and seen and wxy is not None:
            draw_wrist(screen, int(wxy[0] * sw), int(wxy[1] * sh), grabbed)

        if use_hands and preview_on and prev is not None:
            blit_preview(screen, prev)

        time_s = font_lg.render(now.strftime("%H:%M"), True, WARM)
        date_s = font_sm.render(now.strftime("%A  ·  %-d %B"), True, SOFT)
        screen.blit(time_s, time_s.get_rect(center=(sw // 2, 72)))
        screen.blit(date_s, date_s.get_rect(center=(sw // 2, 128)))

        if use_hands:
            hint = f"{status}   ·   pinch to move the nOOd   ·   P preview"
        else:
            hint = "voice is the talk  ·  this is just the room"
        hs = font_sm.render(hint, True, (90, 88, 80))
        screen.blit(hs, hs.get_rect(center=(sw // 2, sh - 36)))

        pygame.display.flip()
        clock.tick(30)

    _stop_hands.set()
    if hands_thread is not None:
        hands_thread.join(timeout=2.0)
    pygame.quit()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
