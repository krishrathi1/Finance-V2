import os
import sys

print(f"Python version: {sys.version}")
print(f"CWD: {os.getcwd()}")
print("Environment variables starting with FMP or GROWW:")
for k, v in os.environ.items():
    if k.startswith("FMP") or k.startswith("GROWW") or k.startswith("NEWS"):
        # Mask keys
        mask = v[:4] + "***" if len(v) > 4 else "***"
        print(f"{k}: {mask}")

with open("basic_diag.txt", "w") as f:
    f.write("Basic diag worked!\n")
    f.write(f"Python: {sys.version}\n")
