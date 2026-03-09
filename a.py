from huggingface_hub import snapshot_download
import os

REPO_ID = "mlc-ai/Llama-3.2-3B-Instruct-q4f32_1-MLC" #or another model
LOCAL_DIR = r"aaaaa\backend\ai_models\Llama-3.2-3B-Instruct" #put full path to folder here

#Put in your Huggingface Tokem
token = "aaa"

print("Downloading Snapshot For", REPO_ID, "To", LOCAL_DIR)
snapshot_download(repo_id=REPO_ID, local_dir=LOCAL_DIR, token=token, allow_patterns=["*"])
print("Done")
