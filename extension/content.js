// Content script: a "Try-On" button on product photos of any shop, and a small panel
// that shows the result. All UI lives in a shadow root so shop CSS cannot touch it.
(() => {
  if (window.__ootdTryOn) return;
  window.__ootdTryOn = true;

  const MIN_SIZE = 160; // px: smaller images are thumbnails/icons
  const CATEGORIES = [
    ['Atasan', 'Atasan (top)'],
    ['Bawahan', 'Bawahan (celana/rok)'],
    ['Terusan', 'Terusan (dress)'],
    ['Luaran', 'Luaran (jaket/outer)'],
    ['Sepatu', 'Sepatu'],
    ['Aksesoris', 'Aksesoris'],
  ];
  // First match wins: specific words before generic ones ("shirt dress" is a dress).
  const GUESS = [
    ['Terusan', /\b(dress|gaun|terusan|jumpsuit|overall|romper|gamis)\b/],
    ['Sepatu', /\b(shoes?|sneakers?|sepatu|boots?|sandal|heels?|loafers?|slip ?on|flats?|clogs?|mules?)\b/],
    ['Aksesoris', /\b(watch|jam tangan|bag|tas|hat|topi|cap|glasses|kacamata|belt|ikat pinggang|necklace|kalung|bracelet|gelang|scarf|syal|ring|cincin|earrings?|anting|wallet|dompet)\b/],
    ['Luaran', /\b(jacket|jaket|outer(wear)?|blazer|coat|mantel|cardigan|kardigan|vest|rompi|hoodie|parka|bomber)\b/],
    ['Bawahan', /\b(pants|trousers|celana|jeans|skirt|rok|shorts?|culottes?|joggers?|leggings?|chinos?|bottoms?)\b/],
    ['Atasan', /\b(t-?shirt|kaos|tee|shirt|kemeja|blouse|blus|top|tops|atasan|sweater|knit|polo|tank|crop|tunic|tunik)\b/],
  ];

  const send = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: 'Extension dimuat ulang. Refresh halaman ini.' });
          else resolve(response || { ok: false, error: 'No response' });
        });
      } catch {
        resolve({ ok: false, error: 'Extension dimuat ulang. Refresh halaman ini.' });
      }
    });

  // ------------------------------------------------------------ shadow UI
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      .btn-float { position: fixed; display: none; align-items: center; gap: 6px; padding: 7px 12px; border: 1px solid #C8D9A5;
        background: #fff; color: #191919; font-size: 12px; font-weight: 600; border-radius: 999px; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,.15); }
      .btn-float:hover { background: #F2F7E8; }
      .panel { position: fixed; left: 16px; bottom: 16px; width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
        display: none; flex-direction: column; background: #fff; color: #191919; border: 1px solid #C8D9A5; border-radius: 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,.25); overflow: hidden; }
      .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #E5EBD8; }
      .head b { font-size: 14px; }
      .head span { color: #7A2117; }
      .x { border: 0; background: none; font-size: 20px; line-height: 1; cursor: pointer; color: #96948B; padding: 2px 6px; }
      .body { padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
      .row { display: flex; gap: 10px; align-items: center; }
      .thumb { width: 72px; height: 72px; flex: none; border: 1px solid #C8D9A5; border-radius: 10px; background: #F2F7E8;
        object-fit: contain; }
      label { font-size: 11px; color: #96948B; display: block; }
      select, input { width: 100%; margin-top: 4px; padding: 8px 10px; border: 1px solid #C8D9A5; border-radius: 10px;
        font-size: 13px; color: #191919; background: #fff; }
      .primary { width: 100%; padding: 11px; border: 0; border-radius: 999px; background: #7A2117; color: #fff; font-size: 12px;
        font-weight: 700; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
      .primary:disabled { opacity: .5; cursor: not-allowed; }
      .ghost { padding: 8px 12px; border: 1px solid #C8D9A5; border-radius: 999px; background: #fff; color: #191919; font-size: 12px;
        cursor: pointer; text-decoration: none; text-align: center; }
      .result { width: 100%; border-radius: 12px; border: 1px solid #C8D9A5; background: #F8F6EC; }
      .status { font-size: 12px; color: #191919; }
      .error { font-size: 12px; color: #7A2117; }
      .bar { height: 4px; background: #F2F7E8; border-radius: 4px; overflow: hidden; }
      .bar div { height: 100%; width: 0; background: #7A2117; transition: width .6s; }
      .muted { font-size: 11px; color: #96948B; }
      [hidden] { display: none !important; }
    </style>
    <button class="btn-float" type="button">✦ Try-On</button>
    <div class="panel" role="dialog" aria-label="OOTD-Lab Try-On">
      <div class="head"><b>Try-On · <span>OOTD-Lab</span></b><button class="x" type="button" aria-label="Tutup">×</button></div>
      <div class="body">
        <div class="main">
          <div class="row">
            <img class="thumb" alt="Produk">
            <div style="flex:1;min-width:0">
              <label>Jenis item<select class="category">${CATEGORIES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
            </div>
          </div>
          <p class="muted model-note"></p>
          <button class="primary go" type="button">Coba sekarang</button>
          <div class="progress" hidden>
            <p class="status stage"></p>
            <div class="bar"><div></div></div>
          </div>
          <p class="error main-error" hidden></p>
          <img class="result" alt="Hasil try-on" hidden>
          <div class="row actions" hidden>
            <a class="ghost save" download="ootd-tryon.png" style="flex:1">Simpan gambar</a>
            <button class="ghost again" type="button" style="flex:1">Coba lagi</button>
          </div>
        </div>
      </div>
    </div>`;
  (document.body || document.documentElement).appendChild(host);

  const $ = (selector) => root.querySelector(selector);
  const floatBtn = $('.btn-float');
  const panel = $('.panel');

  // ------------------------------------------------------------ hover button
  let hovered = null; // the product <img> under the pointer
  const productImageAt = (x, y) => {
    // elementsFromPoint also finds images under transparent overlays (common on shop cards)
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === host) continue;
      if (el instanceof HTMLImageElement) {
        const r = el.getBoundingClientRect();
        if (r.width >= MIN_SIZE && r.height >= MIN_SIZE && (el.currentSrc || el.src)) return el;
      }
    }
    return null;
  };
  const placeButton = () => {
    if (!hovered || !hovered.isConnected) return (floatBtn.style.display = 'none');
    const r = hovered.getBoundingClientRect();
    floatBtn.style.display = 'flex';
    floatBtn.style.left = `${Math.max(4, r.right - 104)}px`;
    floatBtn.style.top = `${Math.max(4, r.top + 10)}px`;
  };
  let pending = false;
  document.addEventListener('mousemove', (e) => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (e.composedPath().includes(host)) return; // over our own button/panel
      hovered = productImageAt(e.clientX, e.clientY);
      placeButton();
    });
  }, { passive: true });
  window.addEventListener('scroll', placeButton, { passive: true });
  floatBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (hovered) openPanel(hovered.currentSrc || hovered.src, hovered);
  });

  // ------------------------------------------------------------ panel
  let current = null; // { imageUrl, name }
  let runId = 0;

  const productName = (img) => {
    const card = img?.closest('a, li, article, [class*="product" i], [class*="card" i]');
    const text = (card?.innerText || '').split('\n').map((s) => s.trim()).filter((s) => s.length > 3 && !/^rp|\d/.test(s.toLowerCase()));
    return (img?.alt || text[1] || text[0] || document.title || '').trim().slice(0, 80);
  };
  const guessCategory = (img, name) => {
    const card = img?.closest('a, li, article, [class*="product" i], [class*="card" i]');
    const texts = [name, card?.innerText?.slice(0, 300), img?.currentSrc, location.pathname, document.title];
    for (const text of texts) {
      const t = String(text || '').toLowerCase();
      for (const [category, pattern] of GUESS) if (pattern.test(t)) return category;
    }
    return 'Atasan';
  };

  const show = (el, visible) => { el.hidden = !visible; };
  const resetRun = () => {
    runId++;
    show($('.progress'), false);
    show($('.main-error'), false);
    show($('.result'), false);
    show($('.actions'), false);
    $('.go').disabled = false;
  };

  async function refreshModelNote() {
    const res = await send({ type: 'state' });
    if (res.ok) {
      const { model, hasOwnPhoto } = res.data;
      const label = model === 'own' ? (hasOwnPhoto ? 'foto kamu' : 'foto kamu (belum diupload)')
        : model === 'male' ? 'template laki-laki' : 'template perempuan';
      $('.model-note').textContent = `Dipakai di ${label}. Ganti model/foto lewat ikon extension di toolbar.`;
    }
  }

  async function openPanel(imageUrl, img = null) {
    if (!imageUrl) return;
    const name = productName(img);
    current = { imageUrl, name };
    $('.thumb').src = imageUrl;
    $('.category').value = guessCategory(img, name);
    resetRun();
    panel.style.display = 'flex';
    await refreshModelNote();
  }

  $('.x').addEventListener('click', () => {
    panel.style.display = 'none';
    runId++; // stop polling
  });

  const fail = (message) => {
    $('.main-error').textContent = message;
    show($('.main-error'), true);
    show($('.progress'), false);
    $('.go').disabled = false;
  };
  const progress = (stage, pct) => {
    show($('.progress'), true);
    $('.stage').textContent = stage;
    $('.bar div').style.width = `${pct}%`;
  };
  const done = (image) => {
    show($('.progress'), false);
    $('.result').src = image;
    $('.save').href = image;
    show($('.result'), true);
    show($('.actions'), true);
    $('.go').disabled = false;
  };

  async function run() {
    if (!current) return;
    const id = ++runId;
    $('.go').disabled = true;
    show($('.main-error'), false);
    show($('.result'), false);
    show($('.actions'), false);
    progress('Mengirim ke OOTD-Lab...', 5);
    const res = await send({ type: 'tryon', imageUrl: current.imageUrl, category: $('.category').value, name: current.name });
    if (id !== runId) return;
    if (!res.ok) return fail(res.error);
    if (res.data.image) return done(res.data.image);
    if (!res.data.jobId) return fail(res.data.error || 'Try-on gagal.');
    // Modal pipeline: poll the job (the page keeps the loop alive, not the service worker).
    let misses = 0;
    for (let i = 0; i < 400 && id === runId; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (id !== runId) return;
      const job = await send({ type: 'job', jobId: res.data.jobId });
      if (id !== runId) return;
      if (!job.ok) {
        if (++misses > 5) return fail(job.error);
        continue;
      }
      misses = 0;
      progress(job.data.stage || 'Memproses...', job.data.progress || 10);
      if (job.data.status === 'done' && job.data.image) return done(job.data.image);
      if (job.data.status === 'failed' || job.data.status === 'done') return fail(job.data.error || 'Try-on gagal.');
    }
    if (id === runId) fail('Try-on terlalu lama. Coba lagi.');
  }
  $('.go').addEventListener('click', run);
  $('.again').addEventListener('click', run);

  // OOTD-Lab install page (/extension): show that the extension is installed, and let
  // the user point it at that site's server. The URL is taken from location.origin, never
  // from the message, and the user must confirm, so other sites cannot redirect it.
  document.documentElement.setAttribute('data-ootd-extension', chrome.runtime.getManifest().version);
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.type !== 'ootd-lab:connect') return;
    const origin = location.origin;
    if (!/^https?:/.test(origin)) return;
    if (!window.confirm(`Pakai ${origin} sebagai server OOTD-Lab untuk extension Try-On?`)) return;
    const res = await send({ type: 'settings', appUrl: origin });
    window.postMessage({ type: 'ootd-lab:connected', ok: res.ok, appUrl: origin }, origin);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'open-panel') {
      const img = [...document.images].find((i) => (i.currentSrc || i.src) === message.imageUrl) || null;
      openPanel(message.imageUrl, img);
    }
  });
})();
