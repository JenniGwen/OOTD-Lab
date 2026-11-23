import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

// Privacy policy of the OOTD-Lab Try-On browser extension (required by the Chrome Web
// Store) and of the try-on feature of the web app. Keep it in sync with extension/ and
// the server: what is collected, where it goes, and what is stored.
const UPDATED = '23 November 2026';

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'What the extension does',
    body: (
      <p>
        OOTD-Lab Try-On shows a "Try-On" button on product photos in online shops. When you click it, the product
        photo is put on a model (a built-in template or a photo you uploaded) and the result is shown to you. It has
        a single purpose: virtual try-on of clothing and accessories.
      </p>
    ),
  },
  {
    title: 'Data we handle',
    body: (
      <ul>
        <li><b>Product image</b> you choose to try on (only when you click Try-On or the right-click menu item).</li>
        <li><b>Model photo</b>: the built-in template, or a full-body photo you upload yourself (optional).</li>
        <li><b>Height and weight</b>, only if you enter them (optional), to pick the garment fit.</li>
        <li>The <b>product name</b> shown next to the photo, to guess the item type (top, trousers, shoes, ...).</li>
      </ul>
    ),
  },
  {
    title: 'What we do not collect',
    body: (
      <ul>
        <li>No account, login, name, email address or password.</li>
        <li>No browsing history. The extension reads a page only to find the product photo under your mouse pointer;
          nothing is sent until you click Try-On.</li>
        <li>No payment details, cookies of other sites, or form contents.</li>
        <li>No analytics, advertising or tracking.</li>
      </ul>
    ),
  },
  {
    title: 'Where the data goes',
    body: (
      <>
        <p>
          When you click Try-On, the product image, the model photo and the optional height/weight are sent over HTTPS
          to the OOTD-Lab server (ootd-lab-ivory.vercel.app). The server passes them to the AI services that generate
          the try-on image: our image pipeline running on Modal (modal.com) and, as a fallback, Google Gemini.
        </p>
        <p>
          Inputs and generated images of a try-on are stored on the processing storage so the result can be delivered
          and a step can be retried. They are used only to produce your try-on result: never sold, never shared
          for advertising, and not used to identify you.
        </p>
      </>
    ),
  },
  {
    title: 'Stored on your device',
    body: (
      <p>
        Your model choice, uploaded photo, height/weight and server address are saved in the extension's local
        storage in your browser (chrome.storage.local). They stay on your device until you change them or remove the
        extension.
      </p>
    ),
  },
  {
    title: 'Permissions',
    body: (
      <ul>
        <li><b>Access to websites</b>: to show the Try-On button on shop pages and to download the product photo you
          pick (shops do not allow other sites to load their images).</li>
        <li><b>Storage</b>: to remember your settings on your device.</li>
        <li><b>Context menus</b>: the "Try-On dengan OOTD-Lab" item when you right-click an image.</li>
      </ul>
    ),
  },
  {
    title: 'Your choices',
    body: (
      <p>
        Uploading your own photo is optional; you can use a template model instead. Remove your photo by choosing a
        template, or uninstall the extension to delete all its local data. For questions or deletion requests,
        contact us through the developer contact on the Chrome Web Store listing.
      </p>
    ),
  },
  {
    title: 'Changes',
    body: <p>We will update this page when the extension starts handling data differently.</p>,
  },
];

export const PrivacyPolicy: React.FC = () => {
  useEffect(() => {
    document.title = 'Privacy Policy · OOTD Lab';
  }, []);
  return (
    <div className="min-h-screen bg-[#F9F8F5] text-[#191919] antialiased">
      <header className="border-b border-[#C8D9A5] bg-[rgba(249,248,245,0.9)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="font-brand text-2xl font-semibold italic tracking-tight hover:text-[#7A2117]">OOTD Lab</a>
          <a href="/extension" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#96948B] hover:text-[#191919]">
            <ArrowLeft className="h-3.5 w-3.5" /> Extension
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#96948B]">OOTD-Lab Try-On extension and web app · Last updated {UPDATED}</p>
        <div className="mt-8 space-y-8">
          {SECTIONS.map(({ title, body }) => (
            <section key={title}>
              <h2 className="text-lg font-semibold">{title}</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-[#4A4943] [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
                {body}
              </div>
            </section>
          ))}
        </div>
      </main>
      <footer className="mx-auto max-w-3xl border-t border-[#C8D9A5] px-4 py-6 text-xs text-[#96948B] sm:px-6">© 2026 OOTD Lab</footer>
    </div>
  );
};
