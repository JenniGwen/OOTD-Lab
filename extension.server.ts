// API for the OOTD-Lab browser extension (extension/). No login: it is the same try-on
// API the web app uses at /api/vton, plus CORS for extension origins.
//
//   *  /api/ext/vton/...   -> same try-on API as /api/vton
import { Router, type RequestHandler } from 'express';

// Optional: comma-separated extension ids allowed to call the API (chrome-extension://<id>).
// Empty = any extension origin (fine while installing unpacked: the id differs per machine).
const ALLOWED_IDS = (process.env.EXTENSION_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

function allowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const m = /^(chrome-extension|moz-extension):\/\/([a-z0-9-]+)$/i.exec(origin);
  return Boolean(m) && (ALLOWED_IDS.length === 0 || ALLOWED_IDS.includes(m![2]));
}

const cors: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');
  if (allowedOrigin(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin!,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      Vary: 'Origin',
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(allowedOrigin(origin) ? 204 : 403);
  next();
};

/** `vtonApi` is the same router that serves /api/vton for the web app. */
export function extensionRouter(vtonApi: Router): Router {
  const router = Router();
  router.use(cors);
  router.get('/ping', (_req, res) => res.json({ ok: true, app: 'ootd-lab' }));
  router.use('/vton', vtonApi);
  return router;
}
