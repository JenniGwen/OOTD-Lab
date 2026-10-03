// npm install @google/genai express
import { Router, json } from 'express';
import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | undefined;
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

type Inline = { inlineData: { mimeType: string; data: string } };

function getGeminiClient(): GoogleGenAI {
  if (ai) return ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is missing. Add GEMINI_API_KEY to .env.local and restart the server.');
  ai = new GoogleGenAI({ apiKey });
  return ai;
}

// Accepts a data URL or an http(s) URL and returns a Gemini inline image part.
// NOTE: if closet URLs can be user-supplied, restrict allowed hosts here (SSRF).
async function toPart(src: string, baseUrl: string): Promise<Inline> {
  if (typeof src !== 'string' || !src.trim()) throw new Error('An image is required.');
  const m = /^data:(.+?);base64,(.*)$/.exec(src);
  if (m) return { inlineData: { mimeType: m[1], data: m[2] } };
  const imageUrl = new URL(src, baseUrl);
  if (imageUrl.protocol !== 'http:' && imageUrl.protocol !== 'https:') throw new Error('Unsupported image URL.');
  const r = await fetch(imageUrl);
  if (!r.ok) throw new Error(`Could not load image: ${src.slice(0, 80)}`);
  const mimeType = r.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  if (!mimeType.startsWith('image/')) throw new Error(`URL did not return an image: ${src.slice(0, 80)}`);
  return { inlineData: { mimeType, data: Buffer.from(await r.arrayBuffer()).toString('base64') } };
}

async function runGemini(parts: (Inline | { text: string })[]): Promise<string> {
  const res = await getGeminiClient().models.generateContent({
    model: MODEL,
    contents: parts,
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  });
  const out = res.candidates?.[0]?.content?.parts ?? [];
  const img = out.find((p) => p.inlineData?.data);
  if (!img?.inlineData) {
    const why = out.map((p) => p.text).filter(Boolean).join(' ') || 'No image returned (possibly blocked by safety filters).';
    throw new Error(why);
  }
  return `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`;
}

export const vtonRouter = Router();
vtonRouter.use(json({ limit: '25mb' }));

// Step 1: face photo + height + weight -> full body model
vtonRouter.post('/body', async (req, res) => {
  try {
    const { facePhoto, heightCm, weightKg, background = 'plain white' } = req.body;
    if (typeof facePhoto !== 'string' || !facePhoto) {
      return res.status(400).json({ error: 'Face photo is required.' });
    }
    const h = Math.min(220, Math.max(120, Number(heightCm)));
    const w = Math.min(200, Math.max(30, Number(weightKg)));
    const bmi = (w / (h / 100) ** 2).toFixed(1);
    const assetOrigin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const image = await runGemini([
      await toPart(facePhoto, assetOrigin),
      {
        text:
          `Using this person's face and head from the photo, generate a realistic full body photo of the SAME person ` +
          `standing straight, facing the camera, arms relaxed and slightly away from the body, head to toe fully visible including feet. ` +
          `Body: height ${h} cm, weight ${w} kg (BMI about ${bmi}); make the proportions, shoulders, waist and limbs realistic for these measurements. ` +
          `Keep the face, hairstyle and skin tone identical to the photo. ` +
          `Wear a simple plain fitted white t-shirt and plain shorts, plain sneakers. ` +
          `Studio photo, even lighting, ${background} background, no props, no text. Portrait 3:4 framing.`,
      },
    ]);
    res.json({ image });
  } catch (e: any) {
    console.error('body error', e);
    res.status(process.env.GEMINI_API_KEY ? 500 : 503).json({ error: e.message || 'Body generation failed' });
  }
});

// Step 2: body image + garments -> try-on render
vtonRouter.post('/tryon', async (req, res) => {
  try {
    const { garments, fitStyle = 'regular', tuckStyle = 'untucked', background = 'plain white' } = req.body;
    // the try-on page sends personImage; older callers send bodyImage
    const bodyImage = req.body.bodyImage ?? req.body.personImage;
    if (typeof bodyImage !== 'string' || !bodyImage) {
      return res.status(400).json({ error: 'Body image is required.' });
    }
    if (!Array.isArray(garments) || !garments.length) {
      return res.status(400).json({ error: 'No garments selected.' });
    }
    const assetOrigin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const list = garments
      .map((g: any, i: number) => `Image ${i + 2}: ${g.name} (${g.category}${g.color ? ', ' + g.color : ''}${g.material ? ', ' + g.material : ''})`)
      .join('\n');
    const parts: (Inline | { text: string })[] = [await toPart(bodyImage, assetOrigin)];
    for (const g of garments) parts.push(await toPart(g.imageUrl, assetOrigin));
    parts.push({
      text:
        `Image 1 is the person. The other images are clothing items:\n${list}\n\n` +
        `Dress the person in ALL of these items. Replace the clothes they currently wear in those areas. ` +
        `Keep the face, hair, skin tone, body shape, pose and proportions exactly the same. ` +
        `Preserve each garment's exact color, pattern, print, texture and cut. ` +
        `Fit: ${fitStyle}${fitStyle === 'oversized' ? ' (loose, roomy, extra fabric)' : fitStyle === 'slim' ? ' (close to the body)' : ' (standard)'}. ` +
        `Tops are worn ${tuckStyle === 'tucked' ? 'tucked into the bottoms' : 'untucked'}. ` +
        `Realistic fabric drape, folds and shadows. Full body visible head to toe, ${background} background, no text.`,
    });
    res.json({ image: await runGemini(parts) });
  } catch (e: any) {
    console.error('tryon error', e);
    res.status(process.env.GEMINI_API_KEY ? 500 : 503).json({ error: e.message || 'Try-on failed' });
  }
});

// In your server entry: app.use('/api/vton', vtonRouter);
