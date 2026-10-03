1. Install dependencies:
   `npm install` and `npm install -D tsx`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## FASHN Virtual Try-On

The try-on service runs separately from the React app and requires a CUDA-capable GPU.
From the project root, install its Python dependencies and download the model weights:

```bash
python -m pip install -r requirements-vton.txt
python fashn-vton-1.5/scripts/download_weights.py --weights-dir ./weights
```

Start the model API in one terminal:

```bash
python -m uvicorn server:app --host 0.0.0.0 --port 8000
```

Start the app in another terminal with `npm run dev`. The app forwards `/api/vton/tryon`
requests to the Python service. Check the FASHN model and bundled third-party licenses
before commercial use.

## Leffa Virtual Try-On (alternative engine, fine-tunable)

`server.py` can run either FASHN (default) or Leffa. Leffa places garments using an
inpainting mask, so `leffa_engine.py` uses each closet item's `subCategory`/name to
pick the target length (mini / knee / midi / ankle) and flare (rok plisket, A-line, etc.).

```bash
# 1. Leffa + patch (mask fixes, fine-tune scripts) + checkpoints, from the project root
git clone https://github.com/franciszzj/Leffa.git
cd Leffa && git apply ../patches/leffa_finetune.patch && pip install -r requirements.txt
python -c "from huggingface_hub import snapshot_download; snapshot_download('franciszzj/Leffa', local_dir='./ckpts')"
cd ..

# 2. Python service with Leffa (CUDA GPU required)
# LEFFA_DC_CKPT is optional: point it at your fine-tuned weights
VTON_ENGINE=leffa LEFFA_DIR=./Leffa \
LEFFA_DC_CKPT=./Leffa/runs/ft1/virtual_tryon_dc_ft_3000.pth \
python -m uvicorn server:app --host 0.0.0.0 --port 8000

# 3. App (in .env.local): VTON_BACKEND_URL=http://localhost:8000, then npm run dev
```

Without `VTON_BACKEND_URL`, `/api/vton/tryon` is handled by Gemini instead.
Fine-tuning: see `prepare_data.py` and `train_vton.py` inside the patched Leffa repo.
Leffa's released weights are trained on VITON-HD/DressCode (research licenses) — check before commercial use.
