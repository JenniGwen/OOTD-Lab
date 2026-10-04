# OOTD-Lab — Hybrid Virtual Try-On di Modal

Pipeline try-on berantai: foto orang + beberapa foto pakaian → klasifikasi otomatis →
dipasang satu per satu (atasan → dress → bawahan → luaran → alas → aksesoris). Hasil tiap step
disimpan, jadi satu item bisa diganti tanpa mengulang step sebelumnya.

| Komponen | Model | Hardware |
|---|---|---|
| Klasifikasi | Shared Endpoint `Qwen/Qwen3.8-Max-VL-Thinking`, fallback FashionCLIP | CPU |
| Atasan / bawahan / dress | Leffa (`virtual_tryon.pth`, `virtual_tryon_dc.pth`) | L40S |
| Luaran / alas / aksesoris / tipe tidak dikenali | `Qwen/Qwen-Image-Edit-2509` (+ Lightning LoRA) | H100 |
| API + UI + orkestrasi | FastAPI + Gradio | CPU |

```
POST /jobs ──► run_pipeline (CPU)
                 ├─ classify_item ×N  (Shared Endpoint VL → fallback CLIP)
                 ├─ build_plan        (urutkan, lewati yang bentrok, beri warning)
                 └─ per step: Leffa.tryon (L40S)  atau  QwenEdit.tryon (H100)
                       └─ /results/{job_id}/step{n}_{category}.png  → input step n+1
status live: modal.Dict `ootd-tryon-jobs`   |   salinan: /results/{job_id}/status.json
```

File: `config.py` (semua konstanta), `common.py` (app, Volume, image), `download_weights.py`,
`models.py` (`Leffa`, `QwenEdit`), `classifier.py`, `pipeline.py`, `app.py`,
`leffa_mask_fix.py` (perbaikan mask dari `patches/leffa_finetune.patch`).

## Setup

Semua perintah dijalankan dari folder `modal_app/`.

```bash
# 0. Modal CLI (sudah terpasang di ../.venv; kalau belum: uv venv ../.venv && uv pip install modal)
source ../.venv/bin/activate

# 1. Login Modal (sekali saja, membuka browser)
modal setup

# 2. Secret untuk Shared Endpoint klasifikasi
#    - URL endpoint: dashboard Modal → Endpoints → endpoint Qwen VL kamu
#    - proxy token:  modal workspace proxy-tokens create
modal secret create ootd-vl-endpoint \
  VL_ENDPOINT_URL=https://<url-endpoint-dari-dashboard> \
  MODAL_PROXY_TOKEN_ID=wk-xxxx \
  MODAL_PROXY_TOKEN_SECRET=ws-xxxx
#    Belum punya endpoint? Secret tetap wajib ada, isi dengan nilai kosong —
#    klasifikasi otomatis memakai FashionCLIP:
#    modal secret create ootd-vl-endpoint VL_ENDPOINT_URL=none MODAL_PROXY_TOKEN_ID=none MODAL_PROXY_TOKEN_SECRET=none

# 3. Download bobot ke Volume (CPU saja, ±75 GB, ±10–20 menit, biaya < $0.10)
modal run download_weights.py
#    atau satu per satu: modal run download_weights.py --only leffa   (leffa | qwen | clip)

# 4. Deploy
modal deploy app.py
```

Setelah deploy, Modal mencetak URL `https://<workspace>--ootd-tryon-web.modal.run`.
UI Gradio ada di `/ui`.

## Tes dengan curl

```bash
BASE=https://<workspace>--ootd-tryon-web.modal.run

# buat job (gambar boleh URL atau base64 / data URL)
curl -s -X POST $BASE/jobs -H 'Content-Type: application/json' -d '{
  "person_image": "https://example.com/person.jpg",
  "items": [
    {"item_id": "kaos",   "image": "https://example.com/tshirt.png"},
    {"item_id": "jeans",  "image": "https://example.com/jeans.png"},
    {"item_id": "sepatu", "image": "https://example.com/sneakers.png", "category_override": "alas"}
  ],
  "qwen_mode": "lightning"
}'
# → {"job_id":"ab12cd34ef56"}

# dari file lokal
jq -n --arg p "$(base64 -i person.jpg)" --arg g "$(base64 -i tshirt.png)" \
  '{person_image:$p, items:[{item_id:"kaos", image:$g}]}' \
  | curl -s -X POST $BASE/jobs -H 'Content-Type: application/json' -d @-

# status + biaya (ulangi sampai status = done / failed)
curl -s $BASE/jobs/ab12cd34ef56 | jq

# gambar hasil step 2 (step 0 = foto orang yang sudah dinormalisasi)
curl -s $BASE/jobs/ab12cd34ef56/steps/2/image -o step2.png

# ganti item di step 2; step 1 tidak diulang, step 3 dst. diulang karena berantai
curl -s -X POST $BASE/jobs/ab12cd34ef56/replace -H 'Content-Type: application/json' \
  -d '{"step_index": 2, "image": "https://example.com/skirt.png"}'

# coba ulang step yang gagal dengan item yang sama
curl -s -X POST $BASE/jobs/ab12cd34ef56/replace -H 'Content-Type: application/json' -d '{"step_index": 3}'

# klasifikasi satu gambar
curl -s -X POST $BASE/classify -H 'Content-Type: application/json' -d '{"image": "https://example.com/tshirt.png"}'
```

Catatan perilaku:

- `step` bernomor mulai 1 dan mencakup step yang `skipped`, jadi `step_index` di `/replace`
  selalu sama dengan `step` di status.
- Status step: `pending`, `running`, `done`, `failed`, `skipped` (dua yang pertama ditambahkan
  supaya progres terlihat).
- Jika ada dress, atasan & bawahan di-skip dengan warning. Satu outfit hanya satu atasan /
  bawahan / dress / luaran / alas; aksesoris boleh lebih dari satu.
- Leffa hanya mengenal atasan / bawahan / dress. Yang dikerjakan Qwen: luaran (dipakai di
  atas atasan), rok (`QWEN_BAWAHAN_SUBTYPES`; Leffa mengubah rok jadi celana kalau orangnya
  memakai celana), dan item `unknown` (dipasang paling akhir dengan prompt umum).
- Hasil klasifikasi dengan confidence di bawah `CONFIDENCE_THRESHOLD` diperlakukan sebagai
  `unknown`, jadi dikerjakan Qwen, bukan ditebak slot Leffa-nya.
- Prompt Qwen tidak menyebut nama item: Qwen membaca jenis item dan cara pakainya dari fotonya.
- Setelah tiap step Qwen, warna pakaian dicek terhadap input step itu (`garment_lock.py`, CPU).
  Pakaian yang warnanya bergeser lebih dari `QWEN_COLOR_LOCK_THRESHOLD` ditempel ulang dari
  hasil step sebelumnya dan dicatat di `warnings`.
- **Size (opsional).** Tiap item boleh diberi `size` (`XS`, `S`, `M`, `L`, `XL`) dan job boleh diberi
  `height_cm` + `weight_kg`. Tinggi/berat menentukan size yang pas di badan (tabel BMI generik di
  `config.py`: `recommend_size`); tanpa keduanya badan dianggap `M` dan pakaian mengikuti foto.
  Selisih size item dengan size badan menjadi `fit`: `tight`, `slim`, `regular`, `loose`, `oversized`.
  Item tanpa `size` selalu `regular`.
- Leffa selalu memasang pakaian pas badan (memperbesar mask-nya hanya menghasilkan artefak), jadi
  atasan / bawahan / dress / luaran dengan fit selain `regular` dikerjakan Qwen dengan kalimat fit di
  prompt (`QWEN_FIT_PHRASES`). Artinya item ber-size non-regular memakai H100, bukan L40S.
- `POST /jobs/{id}/replace` menerima `size` untuk mengganti ukuran satu step saja.
- Step gagal → job `failed`, gambar step sebelumnya tetap ada, `error` menjelaskan penyebabnya.
- `total_cost_usd` kumulatif: biaya run yang diganti lewat `/replace` tetap dihitung.
- Semua gambar dinormalisasi ke 768×1024 (canvas putih), sama dengan resolusi kerja Leffa.

## Estimasi biaya

Harga dicek di modal.com/pricing pada 2026-10-03: H100 $0.001097/dtk, L40S $0.000542/dtk,
CPU $0.0000131/core/dtk, memori $0.00000222/GiB/dtk. Tarif container termasuk CPU+memori:
Leffa ≈ $0.00060/dtk, Qwen ≈ $0.00119/dtk.

Diukur pada job pertama (2026-10-03, mode lightning): Leffa ±6–7 dtk/step dengan cold start
±55 dtk; Qwen lightning ±7–10 dtk dengan cold start ±60–80 dtk. Mode standard **belum diukur**
(perkiraan ±100 dtk/step).

Outfit = atasan + bawahan (Leffa) + sepatu (Qwen):

| | Lightning (8 step) | Standard (40 step, perkiraan) |
|---|---|---|
| Leffa 2 step × ~6,7 dtk | $0.008 | $0.008 |
| Qwen 1 step | ~8,5 dtk → $0.010 | ~100 dtk → $0.12 |
| **Container hangat** | **≈ $0.02** | **≈ $0.13** |
| Cold start Leffa (~55 dtk) + idle 60 dtk | $0.069 | $0.069 |
| Cold start Qwen (~70 dtk) + idle 60 dtk | $0.155 | $0.155 |
| **Job terisolasi (semua dingin)** | **≈ $0.24** | **≈ $0.35** |

Dengan credit $30: ±125 outfit (lightning) / ±85 outfit (standard) kalau tiap job dingin,
sampai ±1500 (lightning) / ±230 (standard) kalau dijalankan beruntun saat container hangat.
Biaya terbesar adalah cold start dan idle H100, bukan inferensinya — kumpulkan job dalam satu sesi.

Yang **tidak** masuk `cost_usd`: waktu idle `scaledown_window` setelah request terakhir,
container CPU (web, pipeline, classifier — sekitar $0.0001/job), dan token Shared Endpoint.
Shared Endpoint ditagih per token dan **tidak bisa dibayar dengan credit bulanan** (lihat
docs Modal "Shared Endpoints"); pasang spend limit di dashboard.

## Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `modal deploy` gagal: secret `ootd-vl-endpoint` not found | Jalankan langkah 2 (boleh nilai `none`). |
| Step gagal `LocalEntryNotFoundError` / `OfflineModeIsEnabled` / file `.pth` tidak ada | Bobot belum ada di Volume. Jalankan `modal run download_weights.py`; cek `modal volume ls leffa-ckpts` dan `modal volume ls hf-cache`. Container GPU sengaja offline supaya tidak pernah download. |
| Build image Leffa gagal atau error import saat load | `requirements.txt` Leffa tidak di-pin; ubah versi di `common.py` (`leffa_image`, bertanda `# VERIFY`). |
| Semua item `needs_review` / `source: clip` | Endpoint VL tidak terjangkau. Cek `VL_ENDPOINT_URL` dan token di secret, lalu `modal app logs ootd-tryon`. HTTP 429 = limit 16 request bersamaan; sudah di-retry dengan backoff. |
| Qwen mengubah wajah/pose | Coba `qwen_mode: "standard"`, atau perketat `QWEN_PROMPTS` di `config.py`. Qwen me-regenerate seluruh gambar, jadi selalu taruh di akhir rantai. |
| Sepatu tidak muncul | Foto orang harus memperlihatkan kaki; Leffa/Qwen tidak memperluas frame. |
| Rok/celana terpotong atau salah bentuk | Mask Leffa memakai `subtype` hasil klasifikasi (mis. `skirt`, `jeans`); lihat masknya dengan `modal run`-kan `Leffa().mask.remote(...)` atau koreksi lewat `category_override`. |
| CUDA OOM di Qwen | Pastikan `QWEN_GPU = "H100"` (bf16 butuh ±60 GB VRAM). |
| Job hilang dari `GET /jobs/{id}` | Entri `modal.Dict` kedaluwarsa setelah 7 hari tanpa akses; status dibaca ulang dari `status.json` di Volume. |
| Biaya idle tinggi | Turunkan `SCALEDOWN_WINDOW` di `config.py`; `modal app stop ootd-tryon` mematikan semuanya. |

Keamanan: URL web publik tanpa autentikasi — siapa pun yang tahu URL-nya bisa menghabiskan
credit. Untuk pemakaian di luar demo, tambahkan `requires_proxy_auth=True` pada
`@modal.asgi_app()` atau cek API key di FastAPI.

Lisensi: bobot Leffa dilatih pada VITON-HD/DressCode (lisensi riset) — cek sebelum pemakaian komersial.
