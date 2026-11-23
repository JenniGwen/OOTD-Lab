import React, { useEffect, useState } from 'react';
import {
  Download, FolderOpen, ToggleRight, PackageOpen, Pin, MousePointerClick, Sparkles, Check, Copy, Link2, ArrowLeft, X,
} from 'lucide-react';

// Built by `npm run zip:extension` from extension/ (served from public/).
const ZIP_URL = '/ootd-lab-extension.zip';
// Chrome Web Store listing. Once set, installing is one click ("Tambahkan ke Chrome");
// until then the extension is installed by hand from the ZIP.
const STORE_URL = import.meta.env.VITE_CHROME_WEBSTORE_URL?.trim() || '';
const WINE = '#7A2117';

const STEPS = [
  { icon: Download, title: 'Download', text: 'Klik tombol download di atas. File ootd-lab-extension.zip akan tersimpan.' },
  { icon: PackageOpen, title: 'Ekstrak ZIP', text: 'Buka file ZIP-nya (double click) sampai jadi folder ootd-lab-extension.' },
  { icon: ToggleRight, title: 'Developer mode', text: 'Buka chrome://extensions lalu nyalakan "Developer mode" di pojok kanan atas.' },
  { icon: FolderOpen, title: 'Load unpacked', text: 'Klik "Load unpacked", lalu pilih folder hasil ekstrak tadi.' },
  { icon: Pin, title: 'Pin & hubungkan', text: 'Pin ikon OOTD-Lab di toolbar, lalu klik "Hubungkan ke server ini" di halaman ini.' },
];
const STORE_STEPS = [
  { icon: Download, title: 'Tambahkan ke Chrome', text: 'Klik tombol di atas, lalu "Add to Chrome" → "Add extension" di Chrome Web Store.' },
  { icon: Pin, title: 'Pin ikonnya', text: 'Klik ikon puzzle di toolbar Chrome, lalu pin OOTD-Lab Try-On.' },
  { icon: MousePointerClick, title: 'Langsung pakai', text: 'Refresh tab toko online yang sudah terbuka, lalu klik ✦ Try-On di foto produk.' },
];

/** Main install button: one click from the Web Store, or the ZIP download. */
const InstallButton: React.FC<{ small?: boolean; onClick?: () => void }> = ({ small = false, onClick }) => {
  const size = small
    ? 'gap-1.5 px-4 py-2 text-xs font-semibold flex-1 sm:flex-none'
    : 'gap-2 px-6 py-3.5 text-xs font-bold uppercase tracking-[0.15em]';
  const icon = small ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const label = STORE_URL ? 'Tambahkan ke Chrome' : small ? 'Download' : 'Download extension';
  return (
    <a href={STORE_URL || ZIP_URL} {...(STORE_URL ? { target: '_blank', rel: 'noopener' } : { download: true })} onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full text-white hover:opacity-90 ${size}`} style={{ background: WINE }}>
      <Download className={icon} /> {label}
    </a>
  );
};

const USAGE = [
  { icon: MousePointerClick, title: 'Arahkan kursor ke foto produk', text: 'Di toko online mana pun, tombol ✦ Try-On muncul di pojok foto.' },
  { icon: Sparkles, title: 'Klik Try-On', text: 'Jenis item ditebak otomatis (atasan, celana, jaket, sepatu, aksesoris) dan bisa kamu ganti.' },
  { icon: Download, title: 'Simpan hasilnya', text: 'Hasil try-on muncul di panel kiri bawah. Simpan atau coba item lain.' },
];

const FAQ = [
  ['Perlu login?', 'Tidak. Pasang, lalu langsung pakai.'],
  ['Browser apa saja?', 'Chrome, Edge, Brave, Arc, dan browser lain berbasis Chromium.'],
  ['Pakai badan siapa?', 'Template model perempuan atau laki-laki, atau upload foto full body kamu sendiri lewat ikon extension (opsional).'],
  ['Data apa yang dikirim?', 'Hanya foto produk yang kamu klik dan foto model/foto kamu, ke server OOTD-Lab untuk diproses.'],
  ['Tombol tidak muncul?', 'Refresh halaman toko setelah memasang extension. Kalau tetap tidak muncul, klik kanan foto produk → "Try-On dengan OOTD-Lab".'],
];

/** Version of the installed extension (its content script marks <html>), or null. */
export function useInstalledExtension(): string | null {
  const [installed, setInstalled] = useState<string | null>(() => document.documentElement.getAttribute('data-ootd-extension'));
  useEffect(() => {
    const check = () => setInstalled(document.documentElement.getAttribute('data-ootd-extension'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ootd-extension'] });
    return () => observer.disconnect();
  }, []);
  return installed;
}

/** Hero, install steps, connect button, usage and FAQ of the /extension page. */
const ExtensionInstallContent: React.FC = () => {
  const installed = useInstalledExtension();
  const [connected, setConnected] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [copied, setCopied] = useState<string | null>(null);
  const origin = window.location.origin;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source === window && event.data?.type === 'ootd-lab:connected') setConnected(event.data.ok ? 'ok' : 'fail');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch { /* clipboard blocked */ }
  };
  const connect = () => window.postMessage({ type: 'ootd-lab:connect' }, origin);

  const CopyChip = ({ text }: { text: string }) => (
    <button type="button" onClick={() => copy(text)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#C8D9A5] bg-white px-3 py-1.5 font-mono text-[11px] text-[#191919] cursor-pointer hover:bg-[#F2F7E8]">
      <span className="truncate">{text}</span>
      {copied === text ? <Check className="h-3.5 w-3.5 shrink-0 text-[#4F7A28]" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-[#96948B]" />}
    </button>
  );

  return (
      <>
        {/* Hero */}
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F2F7E8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4F7A28]">
              <Sparkles className="h-3.5 w-3.5" /> Browser extension · gratis
            </span>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Coba baju dari toko online <span style={{ color: WINE }}>mana pun</span>.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#6B6A63] sm:text-base">
              Pasang OOTD-Lab Try-On, buka toko favoritmu, lalu klik <b>✦ Try-On</b> di foto produk. Tanpa login,
              langsung dicoba di model template atau fotomu sendiri.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <InstallButton />
              {installed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#AFC58C] bg-[#F2F7E8] px-4 py-2.5 text-xs font-medium text-[#4F7A28]">
                  <Check className="h-4 w-4" /> Sudah terpasang (v{installed})
                </span>
              ) : (
                <span className="text-xs text-[#96948B]">Untuk Chrome, Edge, Brave &amp; Arc</span>
              )}
            </div>
          </div>

          {/* Illustration of the in-shop button */}
          <div aria-hidden="true" className="relative mx-auto w-full max-w-[380px]">
            <div className="rounded-2xl border border-[#C8D9A5] bg-white p-3 shadow-[0_20px_50px_-20px_rgba(122,33,23,0.35)]">
              <div className="mb-3 flex gap-1.5">
                {['#E6E2D6', '#E6E2D6', '#E6E2D6'].map((c, i) => <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                  <div key={i} className="min-w-0">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#F2EFE6]">
                      <div className="absolute left-1/2 top-[14%] h-[14%] w-[22%] -translate-x-1/2 rounded-full bg-[#D9CFC0]" />
                      <div className="absolute left-1/2 top-[30%] h-[36%] w-[52%] -translate-x-1/2 rounded-t-[40%] rounded-b-lg" style={{ background: i ? '#5B3A2E' : '#E8E1D2' }} />
                      <div className="absolute left-1/2 top-[64%] h-[30%] w-[40%] -translate-x-1/2 rounded-b-md bg-[#6E83A3]" />
                      {i === 0 && (
                        <span className="absolute right-2 top-2 rounded-full border border-[#C8D9A5] bg-white px-2 py-1 text-[9px] font-semibold shadow">✦ Try-On</span>
                      )}
                    </div>
                    <div className="mt-2 h-2 w-3/4 rounded bg-[#ECE8DD]" />
                    <div className="mt-1.5 h-2 w-1/2 rounded bg-[#ECE8DD]" />
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-3 w-[46%] rounded-xl border border-[#C8D9A5] bg-white p-2 shadow-lg sm:-left-6">
              <p className="mb-1.5 text-[9px] font-semibold">Try-On · <span style={{ color: WINE }}>OOTD-Lab</span></p>
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-[#F8F6EC]">
                <div className="absolute left-1/2 top-[10%] h-[13%] w-[20%] -translate-x-1/2 rounded-full bg-[#D9CFC0]" />
                <div className="absolute left-1/2 top-[25%] h-[36%] w-[50%] -translate-x-1/2 rounded-t-[40%] rounded-b-lg bg-[#E8E1D2]" />
                <div className="absolute left-1/2 top-[25%] h-[38%] w-[56%] -translate-x-1/2 rounded-t-[40%] rounded-b-lg border-x-[7px] border-t-[5px] border-[#5B3A2E]" />
                <div className="absolute left-1/2 top-[60%] h-[32%] w-[38%] -translate-x-1/2 rounded-b-md bg-[#6E83A3]" />
              </div>
            </div>
          </div>
        </section>

        {/* Install steps */}
        <section className="mt-20" aria-labelledby="steps-title">
          <h2 id="steps-title" className="text-xl font-semibold tracking-tight sm:text-2xl">Cara pasang</h2>
          <p className="mt-1 text-sm text-[#96948B]">
            {STORE_URL ? 'Satu klik dari Chrome Web Store.' : 'Sekitar 1 menit. Belum ada di Chrome Web Store, jadi dipasang manual.'}
          </p>
          <ol className={`mt-6 grid gap-3 sm:grid-cols-2 ${STORE_URL ? 'lg:grid-cols-3' : 'lg:grid-cols-5'}`}>
            {(STORE_URL ? STORE_STEPS : STEPS).map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="min-w-0 rounded-2xl border border-[#C8D9A5] bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: WINE }}>{i + 1}</span>
                  <Icon className="h-4 w-4 text-[#4F7A28]" />
                </div>
                <p className="mt-3 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#6B6A63]">{text}</p>
                {!STORE_URL && i === 2 && <div className="mt-3"><CopyChip text="chrome://extensions" /></div>}
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#C8D9A5] bg-[#F2F7E8] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Hubungkan extension ke server ini</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#6B6A63]">
                {installed
                  ? 'Klik tombolnya lalu setujui konfirmasi dari browser.'
                  : 'Pasang extension dulu, lalu refresh halaman ini. Atau isi manual di popup extension → Pengaturan server:'}
              </p>
              {!installed && <div className="mt-2"><CopyChip text={origin} /></div>}
            </div>
            <button type="button" onClick={connect} disabled={!installed}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#7A2117] bg-white px-5 py-2.5 text-xs font-semibold text-[#7A2117] cursor-pointer hover:bg-[#FBF3F1] disabled:cursor-not-allowed disabled:opacity-40">
              {connected === 'ok' ? <><Check className="h-4 w-4" /> Terhubung</> : <><Link2 className="h-4 w-4" /> Hubungkan ke server ini</>}
            </button>
          </div>
          {connected === 'fail' && <p className="mt-2 text-xs text-[#7A2117]">Gagal menyimpan. Isi URL di popup extension → Pengaturan server.</p>}
        </section>

        {/* Usage */}
        <section className="mt-16" aria-labelledby="usage-title">
          <h2 id="usage-title" className="text-xl font-semibold tracking-tight sm:text-2xl">Cara pakai</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {USAGE.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-[#C8D9A5] bg-white p-5">
                <Icon className="h-5 w-5" style={{ color: WINE }} />
                <p className="mt-3 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#6B6A63]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16" aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-xl font-semibold tracking-tight sm:text-2xl">Pertanyaan</h2>
          <div className="mt-4 divide-y divide-[#E5EBD8] rounded-2xl border border-[#C8D9A5] bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                  {q}
                  <span className="text-lg leading-none text-[#96948B] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-[#6B6A63]">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </>
  );
};

/** Full page at /extension. */
export const ExtensionInstall: React.FC = () => {
  useEffect(() => {
    document.title = 'Pasang Extension · OOTD Lab';
  }, []);
  return (
    <div className="min-h-screen bg-[#F9F8F5] text-[#191919] antialiased">
      <header className="border-b border-[#C8D9A5] bg-[rgba(249,248,245,0.9)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="font-brand text-2xl font-semibold italic tracking-tight hover:text-[#7A2117]">OOTD Lab</a>
          <a href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#96948B] hover:text-[#191919]">
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke app
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <ExtensionInstallContent />
      </main>
      <footer className="mx-auto flex max-w-5xl justify-between border-t border-[#C8D9A5] px-4 py-6 text-xs text-[#96948B] sm:px-6">
        <span>© 2026 OOTD Lab</span>
        <a href="/privacy" className="hover:text-[#191919]">Privacy Policy</a>
      </footer>
    </div>
  );
};

const DISMISS_KEY = 'ootd.extensionBannerDismissed';

/**
 * Cookie-style bar at the bottom of the main page. Shown until the user closes it or
 * downloads the extension, and never when the extension is already installed.
 */
export const ExtensionBanner: React.FC = () => {
  const installed = useInstalledExtension();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = Boolean(localStorage.getItem(DISMISS_KEY)); } catch { /* storage unavailable */ }
    if (dismissed) return;
    // Give the extension's content script a moment to mark the page first.
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);
  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage unavailable */ }
  };
  if (!visible || installed) return null;
  return (
    <div role="region" aria-label="Extension OOTD-Lab Try-On"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-6 sm:pb-5 [animation:ootd-banner-in_.35s_ease-out]">
      <style>{'@keyframes ootd-banner-in{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}'}</style>
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-[#C8D9A5] bg-white/95 p-4 text-[#191919] shadow-[0_10px_40px_-12px_rgba(25,25,25,0.35)] backdrop-blur sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F2F7E8]">
            <Sparkles className="h-4 w-4" style={{ color: WINE }} />
          </span>
          <p className="min-w-0 text-xs leading-relaxed text-[#6B6A63] sm:text-[13px]">
            <b className="font-semibold text-[#191919]">Coba baju dari toko online mana pun.</b>{' '}
            Pasang extension OOTD-Lab Try-On, lalu klik ✦ Try-On di foto produk. Gratis, tanpa login.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href="/extension" className="flex-1 rounded-full border border-[#C8D9A5] bg-white px-4 py-2 text-center text-xs font-medium hover:bg-[#F2F7E8] sm:flex-none">
            Cara pasang
          </a>
          <InstallButton small onClick={dismiss} />
          <button type="button" onClick={dismiss} aria-label="Tutup" title="Tutup"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#96948B] cursor-pointer hover:bg-[#F2F7E8] hover:text-[#191919]">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
