// Service worker: talks to the OOTD-Lab server and downloads product images, so page
// CSP/CORS rules of the shop do not apply.
const DEFAULT_APP_URL = 'https://ootd-lab-ivory.vercel.app';
const TEMPLATES = { female: '/models/female.png', male: '/models/male.png' };

const store = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (values) => chrome.storage.local.set(values),
};

async function appUrl() {
  const { appUrl } = await store.get('appUrl');
  return String(appUrl || DEFAULT_APP_URL).replace(/\/+$/, '');
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch((await appUrl()) + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error(`Server OOTD-Lab tidak bisa dihubungi (${await appUrl()}).`), { status: 0 });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { status: r.status });
  return data;
}

// ---------------------------------------------------------------- images
const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// Fetches any image (the extension may read every host) and re-encodes it as a
// downscaled JPEG/PNG data URL, so the server never fetches shop URLs itself.
async function imageAsDataUrl(url, max = 1024) {
  if (url.startsWith('data:')) return url;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Gambar tidak bisa diambil (${r.status}).`);
  const blob = await r.blob();
  if (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') throw new Error('URL itu bukan gambar.');
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = blob.type === 'image/png'; // keep transparency of cut-out product shots
    return toDataUrl(await canvas.convertToBlob(png ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.9 }));
  } catch {
    return toDataUrl(blob); // formats createImageBitmap cannot decode (e.g. some AVIF)
  }
}

async function personImage() {
  const { model = 'female', ownPhoto } = await store.get(['model', 'ownPhoto']);
  if (model === 'own') {
    if (!ownPhoto) throw new Error('Belum ada foto. Upload foto full body di popup extension, atau pilih template.');
    return ownPhoto;
  }
  try {
    return await imageAsDataUrl((await appUrl()) + (TEMPLATES[model] || TEMPLATES.female));
  } catch {
    throw new Error('Gambar template model belum ada di server. Upload foto sendiri di popup extension.');
  }
}

// ---------------------------------------------------------------- try-on
async function startTryOn({ imageUrl, category, name }) {
  const [person, garment, { body }] = await Promise.all([personImage(), imageAsDataUrl(imageUrl), store.get('body')]);
  const heightCm = Number(body?.height);
  const weightKg = Number(body?.weight);
  const item = { name: String(name || category).slice(0, 60), category, subCategory: name, imageUrl: garment };
  // The Modal pipeline takes any category; the Gemini fallback only reads `garments`.
  return request('/api/ext/vton/tryon', {
    method: 'POST',
    body: {
      personImage: person,
      garments: [item],
      ...(heightCm > 0 && weightKg > 0 ? { heightCm, weightKg } : {}),
    },
  });
}

const handlers = {
  async state() {
    const { model = 'female', ownPhoto, body } = await store.get(['model', 'ownPhoto', 'body']);
    return { appUrl: await appUrl(), model, hasOwnPhoto: Boolean(ownPhoto), body: body || {} };
  },
  ping: () => request('/api/ext/ping'),
  async settings(values) {
    const allowed = {};
    for (const key of ['appUrl', 'model', 'ownPhoto', 'body']) if (key in values) allowed[key] = values[key];
    await store.set(allowed);
    return {};
  },
  tryon: startTryOn,
  job: ({ jobId }) => request(`/api/ext/vton/jobs/${encodeURIComponent(jobId)}`),
};

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler(message)
    .then((data) => reply({ ok: true, data }))
    .catch((e) => reply({ ok: false, error: e.message || String(e), status: e.status }));
  return true; // async reply
});

// Right-click any image -> try it on (also works where the hover button cannot show).
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'ootd-tryon', title: 'Try-On dengan OOTD-Lab', contexts: ['image'] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ootd-tryon' && tab?.id != null && info.srcUrl) {
    chrome.tabs.sendMessage(tab.id, { type: 'open-panel', imageUrl: info.srcUrl }).catch(() => {});
  }
});
