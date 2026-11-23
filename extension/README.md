# OOTD-Lab Try-On (browser extension)

Try on clothes from any online shop. Hover a product photo and click **✦ Try-On**, or
right-click an image → **Try-On dengan OOTD-Lab**. No login needed.

## Install
Open `/extension` on the OOTD-Lab site (install page with download + steps), or:
1. `npm run zip:extension` (also runs on `npm run build`) → `public/ootd-lab-extension.zip`.
2. Chrome → `chrome://extensions` → *Developer mode* → *Load unpacked* → pick this folder.
3. On the install page click **Hubungkan ke server ini**, or set the URL in the popup
   (*Pengaturan server*, default `https://ootd-lab-ivory.vercel.app`; use `http://localhost:3000` while developing).

## Model
Female/male template (`public/models/female.png`, `male.png`) or your own full-body
photo, picked in the popup. Height/weight are optional (size/fit).

## Files
- `content.js` – Try-On button + result panel (shadow DOM) on every page; marks the
  install page so it can show "installed" and connect to its server (user confirms).
- `background.js` – downloads the product image and calls `POST /api/ext/vton/tryon`.
- Server: `extension.server.ts` (CORS for extension origins) reuses the web app's try-on API.

Re-run `npm run zip:extension` after changing files here so the download stays current.
