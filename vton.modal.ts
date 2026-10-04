// Adapter between the try-on page and the Modal hybrid pipeline (modal_app/).
// Modal runs a job step by step (Leffa for tops/bottoms/dresses, then Qwen for
// shoes/accessories), so /tryon returns a jobId and the page polls /jobs/:id.
import { Router } from 'express';

// closet category -> modal_app/config.py CATEGORIES
const CATEGORY: Record<string, string> = {
  Atasan: 'atasan',
  Bawahan: 'bawahan',
  Terusan: 'dress',
  Luaran: 'luaran',
  Sepatu: 'alas',
  Aksesoris: 'aksesoris',
};
const LABEL: Record<string, string> = {
  atasan: 'top', bawahan: 'bottom', dress: 'one-piece', luaran: 'outerwear', alas: 'shoes', aksesoris: 'accessory',
};

// Leffa picks the mask length/flare from keywords in this text, and a skirt ("rok") is
// routed to Qwen (see modal_app/config.py). Items handled by Qwen need no subtype:
// it reads the item from the photo.
function subtypeFor(category: string, g: any): string | undefined {
  if (category !== 'bawahan' && category !== 'dress') return undefined;
  return `${g.subCategory || ''} ${g.name || ''}`.trim().toLowerCase() || undefined;
}

// Modal cannot reach localhost, so closet images are sent as base64.
async function toImageRef(src: unknown, baseUrl: string): Promise<string> {
  if (typeof src !== 'string' || !src.trim()) throw new Error('An image is required.');
  if (src.startsWith('data:')) return src;
  const imageUrl = new URL(src, baseUrl);
  if (imageUrl.protocol !== 'http:' && imageUrl.protocol !== 'https:') throw new Error('Unsupported image URL.');
  const r = await fetch(imageUrl);
  if (!r.ok) throw new Error(`Could not load image: ${src.slice(0, 80)}`);
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}

export function modalVtonRouter(modalUrl: string): Router {
  const base = modalUrl.replace(/\/+$/, '');
  // Only needed when the Modal app is deployed with requires_proxy_auth=True
  const auth: Record<string, string> = process.env.MODAL_PROXY_TOKEN_ID
    ? { 'Modal-Key': process.env.MODAL_PROXY_TOKEN_ID, 'Modal-Secret': process.env.MODAL_PROXY_TOKEN_SECRET || '' }
    : {};

  async function modal(path: string, body?: unknown): Promise<Response> {
    const r = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { ...auth, 'Content-Type': 'application/json' } : auth,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000), // the web container may be cold
    });
    if (!r.ok) {
      const data: any = await r.json().catch(() => ({}));
      const error: any = new Error(data.detail || `Modal backend returned ${r.status}`);
      error.status = r.status;
      throw error;
    }
    return r;
  }

  const fail = (res: any, e: any) => {
    console.error('modal vton error', e);
    const unreachable = !e.status;
    res.status(unreachable ? 502 : e.status).json({
      error: unreachable ? `Modal backend unreachable at ${base}: ${e.message}` : e.message,
    });
  };

  const router = Router();

  router.post('/tryon', async (req, res) => {
    try {
      const { personImage, garments = [], extras = [] } = req.body;
      if (typeof personImage !== 'string' || !personImage) {
        return res.status(400).json({ error: 'Body image is required.' });
      }
      const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
      const items = [];
      for (const g of [...garments, ...extras]) {
        const category = CATEGORY[g?.category];
        if (!category || !g.imageUrl) continue;
        items.push({
          item_id: String(g.name || category).slice(0, 60),
          image: await toImageRef(g.imageUrl, origin),
          category_override: category, // the closet already knows it: skip classification
          subtype: subtypeFor(category, g),
        });
      }
      if (!items.length) return res.status(400).json({ error: 'No supported garments selected.' });
      const r = await modal('/jobs', { person_image: personImage, items });
      const jobId = ((await r.json()) as any).job_id;
      // per-step images for debugging: <MODAL_VTON_URL>/jobs/<id>/steps/<n>/image
      console.log(`modal vton job ${jobId}: ${items.map((i) => i.category_override).join(', ')}`);
      res.json({ jobId });
    } catch (e: any) {
      fail(res, e);
    }
  });

  router.get('/jobs/:id', async (req, res) => {
    try {
      const id = req.params.id;
      if (!/^[a-f0-9]{12}$/.test(id)) return res.status(400).json({ error: 'Invalid job id.' });
      const job: any = await (await modal(`/jobs/${id}`)).json();
      const steps: any[] = (job.steps || []).filter((s: any) => s.status !== 'skipped');
      const done = steps.filter((s) => s.status === 'done');
      const lastDone = done[done.length - 1];
      const finished = job.status === 'done' || job.status === 'failed';

      let stage = 'Waiting for the try-on worker...';
      let progress = 5;
      if (job.status === 'classifying') {
        stage = 'Checking the outfit...';
        progress = 10;
      } else if (job.status === 'running') {
        const current = steps.find((s) => s.step === job.current_step);
        stage = `Putting on the ${LABEL[current?.category] || 'outfit'} (${Math.min(done.length + 1, steps.length)}/${steps.length})...`;
        progress = 15 + Math.round((80 * done.length) / Math.max(1, steps.length));
      } else if (job.status === 'done') {
        stage = 'Done';
        progress = 100;
      }

      let status = job.status;
      let error = job.error || undefined;
      if (status === 'done' && !lastDone) {
        status = 'failed';
        error = (job.warnings || []).join('; ') || 'No item could be tried on.';
      }
      let image: string | undefined;
      if (finished && lastDone) {
        const png = await (await modal(`/jobs/${id}/steps/${lastDone.step}/image`)).arrayBuffer();
        image = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
      }
      res.json({
        status, stage, progress, image, error,
        previewStep: lastDone?.step,
        warnings: job.warnings || [],
      });
    } catch (e: any) {
      fail(res, e);
    }
  });

  // Output of one finished step, shown while the later steps are still running
  router.get('/jobs/:id/steps/:step/image', async (req, res) => {
    try {
      const { id, step } = req.params;
      if (!/^[a-f0-9]{12}$/.test(id) || !/^\d{1,2}$/.test(step)) {
        return res.status(400).json({ error: 'Invalid job id or step.' });
      }
      const png = await (await modal(`/jobs/${id}/steps/${step}/image`)).arrayBuffer();
      res.type('png').send(Buffer.from(png));
    } catch (e: any) {
      fail(res, e);
    }
  });

  return router;
}
