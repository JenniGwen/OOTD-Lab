import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MousePointer2, BoxSelect, Plus, Type, Star, Paintbrush, Pencil, Search, Eraser,
  Slash, Square, RectangleHorizontal, Circle, Pentagon, ChevronLeft, ChevronRight,
  RotateCw, Loader2, Sparkles,
} from 'lucide-react';
import { ClothingItem, VTONResult } from '../types';

interface VirtualTryOnProps {
  closetItems: ClothingItem[];
  preSelectedTop?: ClothingItem | null;
  preSelectedBottom?: ClothingItem | null;
  onSaveToHistory: (result: VTONResult) => void;
  history: VTONResult[];
}

const WINE = '#7A2117';
const PALETTE = [
  { hex: '#FFFFFF', name: 'white' }, { hex: '#F8F6EC', name: 'cream' },
  { hex: '#7A2117', name: 'dark red' }, { hex: '#D8B96A', name: 'yellow' },
  { hex: '#AFC58C', name: 'green' }, { hex: '#C8D9A5', name: 'lime' },
  { hex: '#191919', name: 'black' }, { hex: '#96948B', name: 'gray' },
  { hex: '#FFFDF6', name: 'soft cream' }, { hex: '#F4F1E5', name: 'muted cream' },
  { hex: '#64190F', name: 'deep red' }, { hex: '#90A66F', name: 'olive green' },
];
const MODEL_CATEGORIES = ['Atasan', 'Bawahan', 'Terusan'];
const CATEGORY_ORDER = [...MODEL_CATEGORIES, 'Luaran', 'Sepatu', 'Aksesoris'];

// Shrink big phone photos before sending them to the server
const downscale = (src: string, max = 1024) =>
  new Promise<string>((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = rej;
    img.src = src;
  });

const MODAL_CATEGORIES = ['Luaran', 'Sepatu', 'Aksesoris']; // also tried on when the Modal backend is used

// Garment sizes (Modal backend). Keep in sync with modal_app/config.py: SIZES,
// SIZE_BMI_BOUNDS, SIZE_TALL_CM, SIZE_SHORT_CM and recommend_size().
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const SIZED_CATEGORIES = ['Atasan', 'Bawahan', 'Terusan', 'Luaran'];
const FIT_NAMES = ['tight', 'slim', 'regular', 'loose', 'oversized'];
const BODY_KEY = 'ootd.body';
const recommendSize = (heightCm: number, weightKg: number): string | null => {
  if (!(heightCm >= 120 && heightCm <= 220 && weightKg >= 30 && weightKg <= 200)) return null;
  const bmi = weightKg / (heightCm / 100) ** 2;
  let i = [18.5, 21.5, 24.5, 27.5].filter((bound) => bmi >= bound).length;
  if (heightCm >= 182) i += 1;
  else if (heightCm < 155) i -= 1;
  return SIZES[Math.max(0, Math.min(SIZES.length - 1, i))];
};
const loadBody = (): { height: string; weight: string } => {
  try {
    const saved = JSON.parse(localStorage.getItem(BODY_KEY) || '{}');
    return { height: String(saved.height || ''), weight: String(saved.weight || '') };
  } catch {
    return { height: '', weight: '' };
  }
};

async function api(url: string, body?: unknown): Promise<any> {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `Request failed (${r.status})`);
  return data;
}

const box = 'border border-[#C8D9A5] bg-white rounded-2xl';

export const VirtualTryOn: React.FC<VirtualTryOnProps> = ({
  closetItems, preSelectedTop, preSelectedBottom, onSaveToHistory, history,
}) => {
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [bg, setBg] = useState(PALETTE[0]);
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const [accessoryPicks, setAccessoryPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Next day, next color');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [tips, setTips] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [body, setBody] = useState(loadBody);
  const [sizes, setSizes] = useState<Record<string, string | null>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const categories = useMemo(() => {
    const all = Array.from(new Set(closetItems.map((i) => i.category as string)));
    return CATEGORY_ORDER.filter((category) => category !== 'Aksesoris' && all.includes(category));
  }, [closetItems]);
  const byCat = (c: string) => closetItems.filter((i) => (i.category as string) === c);
  const accessoryItems = useMemo(() => byCat('Aksesoris'), [closetItems]);

  // Keep one-pieces opt-in so they do not combine with other garments by default.
  useEffect(() => {
    setPicks((p) => {
      const n = { ...p };
      for (const c of categories) {
        if (!(c in n)) n[c] = c === 'Terusan' ? null : byCat(c)[0]?.id ?? null;
      }
      if (preSelectedTop) n['Atasan'] = preSelectedTop.id;
      if (preSelectedBottom) n['Bawahan'] = preSelectedBottom.id;
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, preSelectedTop, preSelectedBottom]);

  useEffect(() => {
    setAccessoryPicks((current) => {
      const valid = current.filter((id) => accessoryItems.some((item) => item.id === id));
      if (valid.length > 0 || accessoryItems.length === 0) return valid;
      return [accessoryItems[0].id];
    });
  }, [accessoryItems]);

  const cycle = (c: string, dir: 1 | -1) => {
    const opts: (string | null)[] = [null, ...byCat(c).map((i) => i.id)];
    const idx = opts.indexOf(picks[c] ?? null);
    const next = opts[(idx + dir + opts.length) % opts.length];
    const n = { ...picks, [c]: next };
    if (next && c === 'Terusan') {
      n.Atasan = null;
      n.Bawahan = null;
    } else if (next && ['Atasan', 'Bawahan'].includes(c)) {
      n.Terusan = null;
    }
    setPicks(n);
  };
  const cycleAccessory = (index: number, dir: 1 | -1) => {
    if (accessoryItems.length === 0) return;
    setAccessoryPicks((current) => {
      const next = [...current];
      const options = accessoryItems.map((item) => item.id);
      const currentIndex = options.indexOf(next[index]);
      next[index] = options[(currentIndex + dir + options.length) % options.length];
      return next;
    });
  };
  const addAccessory = () => {
    setAccessoryPicks((current) => {
      const available = accessoryItems.find((item) => !current.includes(item.id));
      return available ? [...current, available.id] : current;
    });
  };
  const removeAccessory = (index: number) => {
    setAccessoryPicks((current) => current.filter((_, pickIndex) => pickIndex !== index));
  };
  const shuffle = () => {
    const n: Record<string, string | null> = {};
    const useOnePiece = byCat('Terusan').length > 0 && Math.random() < 0.2;
    for (const c of categories) {
      const items = byCat(c);
      if (c === 'Terusan') {
        n[c] = useOnePiece && items.length ? items[Math.floor(Math.random() * items.length)].id : null;
      } else if (useOnePiece && ['Atasan', 'Bawahan'].includes(c)) {
        n[c] = null;
      } else {
        n[c] = items.length ? items[Math.floor(Math.random() * items.length)].id : null;
      }
    }
    setAccessoryPicks(accessoryItems.length ? [accessoryItems[Math.floor(Math.random() * accessoryItems.length)].id] : []);
    setPicks(n);
  };
  const chosen = [
    ...categories.map((c) => byCat(c).find((i) => i.id === picks[c])),
    ...accessoryPicks.map((id) => accessoryItems.find((item) => item.id === id)),
  ].filter(Boolean) as ClothingItem[];
  const modelGarments = chosen.filter(({ category }) =>
    MODEL_CATEGORIES.includes(category as string),
  );
  const sideItems = chosen.filter(({ category }) => !MODEL_CATEGORIES.includes(category as string));

  // Height and weight are optional: without them a garment is fitted to the photo, and a
  // picked size is compared with M.
  useEffect(() => {
    try { localStorage.setItem(BODY_KEY, JSON.stringify(body)); } catch { /* storage unavailable */ }
  }, [body]);
  const heightCm = Number(body.height);
  const weightKg = Number(body.weight);
  const bodyGiven = body.height.trim() !== '' || body.weight.trim() !== '';
  const bodySize = recommendSize(heightCm, weightKg);
  const fitOf = (size: string) =>
    FIT_NAMES[Math.max(0, Math.min(4, SIZES.indexOf(size) - SIZES.indexOf(bodySize || 'M') + 2))];

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const fr = new FileReader();
    fr.onload = async () => {
      setPersonPhoto(await downscale(fr.result as string));
      setResult(null);
      setStage('Full-body photo loaded');
    };
    fr.readAsDataURL(f);
  };

  // Modal backend: the outfit is put on one item at a time, so poll the job and
  // show each finished step while the next one runs.
  const waitForJob = async (jobId: string) => {
    let misses = 0;
    for (let i = 0; i < 400; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (!alive.current) break;
      let job;
      try {
        job = await api(`/api/vton/jobs/${jobId}`);
        misses = 0;
      } catch (e) {
        if (++misses > 5) throw e;
        continue;
      }
      setStage(job.stage);
      setProgress(job.progress);
      if (job.status === 'done' || job.status === 'failed') return job;
      if (job.previewStep) setResult(`/api/vton/jobs/${jobId}/steps/${job.previewStep}/image`);
    }
    throw new Error('Try-on timed out.');
  };

  const generate = async () => {
    if (!personPhoto) return setError('Upload a full-body photo first (Image > Upload photo).');
    if (!modelGarments.length) return setError('Pick at least one top, bottom, or one-piece item.');
    if (bodyGiven && !bodySize) return setError('Enter both height (120-220 cm) and weight (30-200 kg), or leave both empty.');
    setError(null);
    setBusy(true);
    try {
      setStage('Dressing you...');
      setProgress(40);
      const pick = ({ name, category, subCategory, imageUrl }: ClothingItem) => ({
        name, category, subCategory, imageUrl, size: sizes[category as string] || undefined,
      });
      let data = await api('/api/vton/tryon', {
        personImage: personPhoto,
        assetBaseUrl: window.location.origin,
        garments: modelGarments.map(pick),
        extras: sideItems.filter(({ category }) => MODAL_CATEGORIES.includes(category as string)).map(pick),
        ...(bodySize ? { heightCm, weightKg } : {}),
      });
      if (data.jobId) data = await waitForJob(data.jobId);
      const img = data.image as string;
      if (img) setResult(img);
      if (data.error || !img) throw new Error(data.error || 'Generation failed');
      setProgress(100);
      setStage('Done' + (data.warnings?.length ? ` · ${data.warnings[0]}` : ''));
      onSaveToHistory({
        id: `vton-${Date.now()}`,
        userPhoto: personPhoto,
        garment: modelGarments[0],
        secondaryGarment: modelGarments[1],
        renderedTryOnUrl: img,
        timestamp: new Date().toISOString(),
      } as unknown as VTONResult);
    } catch (e: any) {
      setError(e.message || 'Generation failed');
      setStage('Something went wrong');
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const src = result || personPhoto;
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `outfit-${Date.now()}.png`;
    a.click();
  };
  const resetAll = () => { setPersonPhoto(null); setResult(null); setStage('Next day, next color'); setProgress(0); };

  const menus: Record<string, [string, () => void][]> = {
    File: [['Save image', save], ['New', resetAll]],
    Edit: [['Shuffle outfit', shuffle], ['Clear result', () => setResult(null)]],
    View: [['Toggle zoom', () => setZoom((v) => !v)]],
    Image: [['Upload photo', () => fileRef.current?.click()]],
    Help: [['Show or hide tips', () => setTips((v) => !v)]],
  };
  const tools: [React.ElementType, string, (() => void)?][] = [
    [MousePointer2, 'Select'], [BoxSelect, 'Marquee'], [Plus, 'Upload photo', () => fileRef.current?.click()], [Type, 'Text'],
    [Star, 'Shuffle outfit', shuffle], [Paintbrush, 'Brush'], [Pencil, 'Pencil'], [Search, 'Zoom', () => setZoom((v) => !v)],
    [Eraser, 'Clear result', () => setResult(null)], [Slash, 'Line'], [Square, 'Rectangle'], [RectangleHorizontal, 'Rounded'],
    [Circle, 'Ellipse'], [Pentagon, 'Polygon'],
  ];

  const shown = result || personPhoto;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 text-[#191919] select-none" onClick={() => setMenu(null)}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />

      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C8D9A5] px-1 pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Outfit of the day</h1>
          <p className="mt-1 text-sm text-[#96948B]">Build a look and preview it on your model.</p>
        </div>
        <span className="rounded-full bg-[#F2F7E8] px-3 py-1.5 text-xs font-medium text-[#191919]">Virtual Try-On</span>
      </div>

      {/* Menu bar */}
      <div className="relative flex flex-wrap gap-2 border-b border-[#C8D9A5] pb-3 text-xs font-medium" onClick={(e) => e.stopPropagation()}>
        {Object.keys(menus).map((m) => (
          <div key={m} className="relative">
            <button className="rounded-full px-3 py-1.5 text-[#96948B] hover:bg-[#F2F7E8] hover:text-[#191919] cursor-pointer" onClick={() => setMenu(menu === m ? null : m)}>{m}</button>
            {menu === m && (
              <div className={`${box} absolute left-0 top-full z-20 mt-1 min-w-[190px] overflow-hidden shadow-lg`}>
                {menus[m].map(([label, fn]) => (
                  <button key={label} className="block w-full rounded-none px-3 py-2.5 text-left text-xs hover:bg-[#F2F7E8] cursor-pointer"
                    onClick={() => { fn(); setMenu(null); }}>{label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
        {/* Left: toolbox + person photo */}
        <div className="min-w-0 space-y-4">
          <div className={`${box} grid grid-cols-4 gap-1 p-2`}>
            {tools.map(([Icon, label, fn], i) => (
              <button key={i} type="button" title={label} aria-label={label} onClick={fn}
                className={`aspect-square w-full flex items-center justify-center border border-[#C8D9A5] text-[#191919] transition-colors ${fn ? 'hover:bg-[#F2F7E8] cursor-pointer' : 'cursor-default'}`}>
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </button>
            ))}
          </div>

          <div className={`${box} min-w-0 bg-[#F2F7E8] p-3 space-y-3 text-xs font-medium`}>
            <button onClick={() => fileRef.current?.click()} className="w-full min-w-0 rounded-full border border-[#C8D9A5] bg-white px-3 py-2 text-xs text-[#191919] cursor-pointer hover:bg-[#F8F6EC]">
              {personPhoto ? 'Change photo' : 'Upload photo'}
            </button>
            <p className="text-[10px] leading-relaxed text-[#96948B]">Full body, standing, facing the camera.</p>
          </div>

          <div className={`${box} min-w-0 p-3 space-y-2 text-xs font-medium`}>
            <p className="text-[11px] font-semibold">Your body <span className="font-normal text-[#96948B]">(optional)</span></p>
            <div className="grid grid-cols-2 gap-2">
              {([['height', 'Height', 'cm'], ['weight', 'Weight', 'kg']] as const).map(([key, label, unit]) => (
                <label key={key} className="min-w-0 text-[10px] text-[#96948B]">
                  {label} ({unit})
                  <input type="number" inputMode="numeric" min={0} value={body[key]} aria-label={`${label} in ${unit}`}
                    onChange={(e) => setBody((b) => ({ ...b, [key]: e.target.value }))}
                    className="mt-1 w-full min-w-0 rounded-lg border border-[#C8D9A5] bg-white px-2 py-1.5 text-xs text-[#191919] select-text" />
                </label>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-[#96948B]">
              {bodySize ? <>Your size: <span className="font-semibold text-[#191919]">{bodySize}</span></>
                : bodyGiven ? 'Enter both height and weight.'
                : 'Leave empty to fit clothes to your photo.'}
            </p>
          </div>
        </div>

        {/* Canvas window */}
        <div className="flex-1 min-w-0">
          <div className={`${box} min-w-0 overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="min-w-0 break-words text-sm font-medium">{error ? <span className="text-[#7A2117]">{error}</span> : stage}</p>
              <span className="shrink-0 rounded-full bg-[#F2F7E8] px-3 py-1 text-[11px] text-[#191919]">{progress}%</span>
            </div>
            <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-3 p-3 pt-0">
              {/* Model */}
              <div className="relative flex min-w-0 aspect-[3/4] sm:aspect-[4/3] sm:min-h-[420px] xl:min-h-[500px] max-h-[680px] items-center justify-center overflow-hidden rounded-xl border border-[#C8D9A5]" style={{ background: bg.hex }}>
                {shown || sideItems.length > 0 ? (
                  <div className={`flex h-full min-h-0 w-full items-center justify-center ${sideItems.length ? 'gap-2 p-2' : ''}`}>
                    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
                      {shown ? (
                        <img src={shown} alt="Full-body try-on preview" className="max-h-[560px] max-w-full object-contain transition-transform duration-300"
                          style={{ transform: zoom ? 'scale(1.35)' : 'none' }} />
                      ) : (
                        <p className="px-4 text-center text-xs leading-relaxed text-[#96948B]">Upload a full-body photo to preview your outfit.</p>
                      )}
                    </div>
                    {sideItems.length > 0 && (
                      <aside aria-label="Outerwear, shoes, and accessories" className="flex max-h-full w-[88px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-[#C8D9A5] pl-2">
                        {sideItems.map((item) => (
                          <div key={item.id} className="min-w-0 text-center" title={`${item.category}: ${item.name}`}>
                            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-[#C8D9A5] bg-white/80 p-1">
                              <img src={item.imageUrl} alt={item.name} referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
                            </div>
                            <span className="mt-1 block truncate text-[9px] text-[#96948B]">{item.name}</span>
                          </div>
                        ))}
                      </aside>
                    )}
                  </div>
                ) : (
                  <p className="max-w-md px-6 text-center text-sm leading-relaxed text-[#96948B]">Upload a full-body photo, pick an outfit, then press Generate.</p>
                )}
                {busy && (
                  <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-2 text-sm font-bold">
                    <Loader2 className="w-7 h-7 animate-spin" style={{ color: WINE }} />
                    <span>{stage}</span>
                  </div>
                )}
              </div>

              {/* Outfit picker */}
              <div className="min-w-0 xl:max-h-[680px] xl:overflow-y-auto">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="min-w-0 truncate text-sm font-semibold">Outfit pieces</span>
                  <button onClick={shuffle} title="Shuffle outfit" aria-label="Shuffle outfit" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7A2117] text-white cursor-pointer hover:bg-[#64190F]">
                    <RotateCw className="h-4 w-4" />
                  </button>
                </div>
                {categories.length === 0 && <p className="text-xs leading-relaxed text-[#96948B]">Your closet is empty.</p>}
                <div className="grid grid-cols-2 gap-3">
                  {categories.map((c) => {
                    const item = byCat(c).find((i) => i.id === picks[c]);
                    return (
                      <div key={c} className="min-w-0">
                        <div className="relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-xl border border-[#C8D9A5] bg-[#F2F7E8] p-2">
                          {item ? (
                            <img src={item.imageUrl} alt={item.name} referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="max-w-full truncate px-2 text-center text-[10px] text-[#96948B]">{c}: none</span>
                          )}
                          <button aria-label={`Previous ${c}`} title={`Previous ${c}`} onClick={() => cycle(c, -1)} className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#C8D9A5] bg-white/95 text-[#191919] cursor-pointer hover:bg-[#F2F7E8]">
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button aria-label={`Next ${c}`} title={`Next ${c}`} onClick={() => cycle(c, 1)} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#C8D9A5] bg-white/95 text-[#191919] cursor-pointer hover:bg-[#F2F7E8]">
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                        <span className="mt-1 block min-w-0 truncate text-center text-[10px] text-[#96948B]" title={item?.name || c}>{item?.name || c}</span>
                        {item && SIZED_CATEGORIES.includes(c) && (
                          <div className="mt-1 flex justify-center gap-0.5" role="group" aria-label={`${c} size`}>
                            {SIZES.map((s) => (
                              <button key={s} type="button" aria-pressed={sizes[c] === s}
                                title={sizes[c] === s ? 'Back to a regular fit' : `Size ${s}: ${fitOf(s)} fit`}
                                onClick={() => setSizes((v) => ({ ...v, [c]: v[c] === s ? null : s }))}
                                className={`h-5 min-w-[22px] rounded-full border px-1 text-[9px] font-semibold cursor-pointer ${sizes[c] === s ? 'border-[#7A2117] bg-[#7A2117] text-white' : 'border-[#C8D9A5] bg-white text-[#96948B] hover:bg-[#F2F7E8]'}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                        {item && sizes[c] && SIZED_CATEGORIES.includes(c) && (
                          <span className="block text-center text-[9px] text-[#96948B]">{fitOf(sizes[c]!)} fit</span>
                        )}
                      </div>
                    );
                  })}
                  {accessoryItems.length > 0 && (
                    <div className="col-span-2 border-t border-[#C8D9A5] pt-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#96948B]">Aksesoris</span>
                        <button
                          type="button"
                          onClick={addAccessory}
                          disabled={accessoryPicks.length >= accessoryItems.length}
                          className="flex items-center gap-1 rounded-full border border-[#C8D9A5] bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#191919] transition-colors hover:bg-[#F2F7E8] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Plus className="h-3 w-3" />
                          Tambah aksesoris
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {accessoryPicks.map((accessoryId, accessoryIndex) => {
                          const item = accessoryItems.find((accessory) => accessory.id === accessoryId);
                          return (
                            <div key={`${accessoryId}-${accessoryIndex}`} className="min-w-0">
                              <div className="relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-xl border border-[#C8D9A5] bg-[#F2F7E8] p-2">
                                {item && <img src={item.imageUrl} alt={item.name} referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />}
                                <button aria-label="Previous accessory" title="Previous accessory" onClick={() => cycleAccessory(accessoryIndex, -1)} className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#C8D9A5] bg-white/95 text-[#191919] cursor-pointer hover:bg-[#F2F7E8]">
                                  <ChevronLeft className="h-4 w-4" />
                                </button>
                                <button aria-label="Next accessory" title="Next accessory" onClick={() => cycleAccessory(accessoryIndex, 1)} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#C8D9A5] bg-white/95 text-[#191919] cursor-pointer hover:bg-[#F2F7E8]">
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                                <button aria-label="Remove accessory" title="Remove accessory" onClick={() => removeAccessory(accessoryIndex)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#191919]/75 text-white cursor-pointer hover:bg-[#7A2117]">
                                  <span className="text-sm leading-none">×</span>
                                </button>
                              </div>
                              <span className="mt-1 block min-w-0 truncate text-center text-[10px] text-[#96948B]" title={item?.name || 'Accessory'}>{item?.name || 'Accessory'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {tips && (
                  <p className="mt-3 break-words text-[11px] leading-relaxed text-[#96948B]">Use the arrows on each tile to browse your closet. Pick the empty slot to leave a category out. Tops, bottoms, and one-pieces are tried on; outerwear, shoes, and accessories appear beside the model. Pick a size under a piece to try it looser or tighter; with no size it is fitted to your body.</p>
                )}
              </div>
            </div>

            <div className="h-1.5 w-full bg-[#F2F7E8]">
              <div className="h-full bg-[#7A2117] transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {history.map((h) => (
                <button key={h.id} onClick={() => setResult(h.renderedTryOnUrl)} title={h.garment?.name}
                  className="shrink-0 w-14 h-[74px] border-2 border-[#C8D9A5] bg-white cursor-pointer overflow-hidden">
                  <img src={h.renderedTryOnUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: colors + generate */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className={`${box} relative w-[88px] h-[88px] shrink-0`}>
          <div className="absolute left-2.5 top-2.5 w-9 h-9 border-2 border-[#C8D9A5] bg-white" />
          <div className="absolute left-8 top-8 w-11 h-11 border-2 border-[#C8D9A5]" style={{ background: bg.hex }} />
        </div>
        <div className="grid grid-cols-6 gap-1.5" title="Preview background color only">
          {PALETTE.map((p) => (
            <button key={p.hex + p.name} aria-label={p.name} onClick={() => setBg(p)}
              className={`w-9 h-9 border-2 cursor-pointer ${bg.name === p.name ? 'border-[#C8D9A5] ring-2 ring-offset-1 ring-[#7A2117]' : 'border-[#C8D9A5]'}`} style={{ background: p.hex }} />
          ))}
        </div>
        <span className="text-[10px] text-[#96948B]">Preview background only</span>
        <button onClick={generate} disabled={busy}
          className="ml-auto flex items-center gap-2 rounded-full px-6 py-3 text-white text-xs italic font-bold tracking-[0.2em] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: WINE }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? 'Generating' : 'Generate'}
        </button>
      </div>
    </div>
  );
};
