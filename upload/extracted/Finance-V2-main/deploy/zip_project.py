import zipfile
import os

# Derived from this script's own location (deploy/zip_project.py -> repo
# root) instead of a hardcoded path, so it doesn't silently zip a stale/wrong
# directory (or fail outright) after the project folder is ever renamed or
# the repo is checked out somewhere else.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_ZIP = os.path.join(REPO_ROOT, 'Finance_Deploy.zip')

def zipdir(path, ziph):
    skip_dirs = ['node_modules', '.next', '.venv', '.git', '__pycache__', '.open-next', '.wrangler', '.code-review-graph', '.obsidian', '.claude']
    for root, dirs, files in os.walk(path):
        # modify dirs in place to skip certain directories
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for file in files:
            file_path = os.path.join(root, file)
            # Skip the zip file itself and other heavy archives to keep it light
            if os.path.abspath(file_path) == OUTPUT_ZIP or file.endswith(('.tar', '.zip', '.tgz', '.rar')):
                continue
            arcname = os.path.relpath(file_path, start=path)
            ziph.write(file_path, arcname)

if __name__ == '__main__':
    zipf = zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED)
    zipdir(REPO_ROOT, zipf)
    zipf.close()
    print(f"Zip created successfully at {OUTPUT_ZIP}")
