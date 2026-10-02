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
