const $ = (id) => document.getElementById(id);
const send = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (r) => resolve(r || { ok: false, error: 'No response' })));
const showError = (el, message) => { el.textContent = message || ''; el.hidden = !message; };

// Shrink phone photos before storing them (chrome.storage.local is limited).
const downscale = (file, max = 1024) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * r);
    c.height = Math.round(img.height * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    resolve(c.toDataURL('image/jpeg', 0.9));
  };
  img.onerror = reject;
  img.src = URL.createObjectURL(file);
});

function setModel(model) {
  for (const b of document.querySelectorAll('.choice')) b.setAttribute('aria-checked', String(b.dataset.model === model));
}

async function render() {
  const res = await send({ type: 'state' });
  if (!res.ok) return;
  const { appUrl, model, body } = res.data;
  $('app-url').value = appUrl;
  setModel(model);
  $('height').value = body.height || '';
  $('weight').value = body.weight || '';
  const { ownPhoto } = await chrome.storage.local.get('ownPhoto');
  $('own-preview').hidden = !ownPhoto;
  if (ownPhoto) $('own-preview').src = ownPhoto;
  $('upload').textContent = ownPhoto ? 'Ganti foto' : 'Upload foto full body (opsional)';
}

for (const b of document.querySelectorAll('.choice')) {
  b.addEventListener('click', async () => {
    const { ownPhoto } = await chrome.storage.local.get('ownPhoto');
    if (b.dataset.model === 'own' && !ownPhoto) return pickPhoto();
    showError($('model-error'));
    await send({ type: 'settings', model: b.dataset.model });
    setModel(b.dataset.model);
  });
}

// The toolbar popup closes when the OS file dialog takes focus (macOS), so pick the
// photo from this page opened in a tab instead.
const inTab = new URLSearchParams(location.search).has('tab');
const pickPhoto = () => (inTab ? $('file').click() : chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab=1') }));
$('upload').addEventListener('click', pickPhoto);
$('file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const ownPhoto = await downscale(file);
    await send({ type: 'settings', ownPhoto, model: 'own' });
    showError($('model-error'));
    render();
  } catch {
    showError($('model-error'), 'Foto tidak bisa dibaca.');
  }
});

let bodyTimer;
for (const id of ['height', 'weight']) {
  $(id).addEventListener('input', () => {
    clearTimeout(bodyTimer);
    bodyTimer = setTimeout(() => send({ type: 'settings', body: { height: $('height').value, weight: $('weight').value } }), 300);
  });
}

$('save-url').addEventListener('click', async () => {
  const value = $('app-url').value.trim();
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    await send({ type: 'settings', appUrl: url.origin });
    render();
    const r = await send({ type: 'ping' });
    $('server-status').textContent = r.ok ? '✓ Server terhubung' : `✗ ${r.error}`;
  } catch {
    $('app-url').setCustomValidity('URL tidak valid');
    $('app-url').reportValidity();
    setTimeout(() => $('app-url').setCustomValidity(''), 2000);
  }
});

render();
send({ type: 'ping' }).then((r) => {
  $('server-status').textContent = r.ok ? '✓ Server terhubung' : `✗ ${r.error}`;
});
