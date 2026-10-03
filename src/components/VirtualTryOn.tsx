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

async function post(url: string, body: unknown): Promise<string> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `Request failed (${r.status})`);
  return data.image as string;
}

const box = 'border border-[#C8D9A5] bg-white rounded-2xl';

export const VirtualTryOn: React.FC<VirtualTryOnProps> = ({
  closetItems, preSelectedTop, preSelectedBottom, onSaveToHistory, history,
}) => {
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [bg, setBg] = useState(PALETTE[0]);
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Next day, next color');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [tips, setTips] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const all = Array.from(new Set(closetItems.map((i) => i.category as string)));
    return CATEGORY_ORDER.filter((category) => all.includes(category));
  }, [closetItems]);
  const byCat = (c: string) => closetItems.filter((i) => (i.category as string) === c);

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
    setPicks(n);
  };
  const chosen = categories
    .map((c) => byCat(c).find((i) => i.id === picks[c]))
    .filter(Boolean) as ClothingItem[];
  const modelGarments = chosen.filter(({ category }) =>
    MODEL_CATEGORIES.includes(category as string),
  );
  const sideItems = chosen.filter(({ category }) => !MODEL_CATEGORIES.includes(category as string));

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

  const generate = async () => {
    if (!personPhoto) return setError('Upload a full-body photo first (Image > Upload photo).');
    if (!modelGarments.length) return setError('Pick at least one top, bottom, or one-piece item.');
    setError(null);
    setBusy(true);
    try {
      setStage('Dressing you...');
      setProgress(40);
      const img = await post('/api/vton/tryon', {
        personImage: personPhoto,
        assetBaseUrl: window.location.origin,
        garments: modelGarments.map(({ name, category, subCategory, imageUrl }) => ({ name, category, subCategory, imageUrl })),
      });
      setResult(img);
      setProgress(100);
      setStage('Done');
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
                      </div>
                    );
                  })}
                </div>
                {tips && (
                  <p className="mt-3 break-words text-[11px] leading-relaxed text-[#96948B]">Use the arrows on each tile to browse your closet. Pick the empty slot to leave a category out. Tops, bottoms, and one-pieces are tried on; outerwear, shoes, and accessories appear beside the model.</p>
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
