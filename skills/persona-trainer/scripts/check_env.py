#!/usr/bin/env python3
"""Check training environment: Python, PyTorch, hardware acceleration."""

import sys
import platform
import subprocess
import importlib.util

def check(name, fn):
    try:
        result = fn()
        print(f"  ✅ {name}: {result}")
        return True
    except Exception as e:
        print(f"  ❌ {name}: {e}")
        return False

def pkg_version(pkg):
    spec = importlib.util.find_spec(pkg)
    if spec is None:
        raise ImportError(f"not installed")
    mod = __import__(pkg)
    return getattr(mod, '__version__', 'installed')

def detect_accelerator():
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_memory // (1024**3)
            return f"CUDA — {name} ({vram} GB VRAM)"
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "Metal (Apple Silicon MPS)"
        return "CPU only (training will be slow)"
    except ImportError:
        raise ImportError("torch not installed")

def recommend_model():
    try:
        import torch
        import psutil
        ram_gb = psutil.virtual_memory().total // (1024**3)

        if torch.cuda.is_available():
            vram = torch.cuda.get_device_properties(0).total_memory // (1024**3)
            if vram >= 16:
                return f"12B (VRAM: {vram} GB)"
            if vram >= 8:
                return f"4B (VRAM: {vram} GB)"
            return f"1B (VRAM: {vram} GB — limited)"
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            if ram_gb >= 16:
                return f"4B (Apple Silicon, {ram_gb} GB RAM)"
            return f"1B (Apple Silicon, {ram_gb} GB RAM)"
        return f"1B CPU-only ({ram_gb} GB RAM — expect 20–30h)"
    except Exception:
        return "unable to determine"

print(f"\n{'='*50}")
print("persona-trainer environment check")
print(f"{'='*50}\n")

print("System:")
check("Python", lambda: f"{sys.version.split()[0]} ({'ok' if sys.version_info >= (3, 11) else 'need ≥ 3.11'})")
check("Platform", lambda: f"{platform.system()} {platform.machine()}")

print("\nPython packages:")
for pkg in ["torch", "transformers", "peft", "datasets", "trl", "bitsandbytes", "accelerate"]:
    check(pkg, lambda p=pkg: pkg_version(p))

print("\nHardware:")
check("Accelerator", detect_accelerator)

print("\nRecommendation:")
check("Model size", recommend_model)

print()
