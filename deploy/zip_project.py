import zipfile
import os

def zipdir(path, ziph):
    skip_dirs = ['node_modules', '.next', '.venv', '.git', '__pycache__', '.open-next', '.wrangler', '.code-review-graph']
    for root, dirs, files in os.walk(path):
        # modify dirs in place to skip certain directories
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for file in files:
            file_path = os.path.join(root, file)
            # Skip the zip file itself so it doesn't try to zip itself recursively
            if file_path == r'C:\Users\KRISH\Desktop\Finance\Finance_Deploy.zip':
                continue
            arcname = os.path.relpath(file_path, start=path)
            ziph.write(file_path, arcname)

if __name__ == '__main__':
    zipf = zipfile.ZipFile(r'C:\Users\KRISH\Desktop\Finance\Finance_Deploy.zip', 'w', zipfile.ZIP_DEFLATED)
    zipdir(r'C:\Users\KRISH\Desktop\Finance', zipf)
    zipf.close()
    print("Zip created successfully at C:\\Users\\KRISH\\Desktop\\Finance\\Finance_Deploy.zip")
