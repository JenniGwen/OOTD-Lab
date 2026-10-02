import React, { useState, useRef } from 'react';
import { X, Upload, Sparkles, Check, AlertCircle, Camera, Loader2 } from 'lucide-react';
import { removeBackground } from '@imgly/background-removal';
import { ClothingCategory, ClothingItem } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveItem: (item: ClothingItem) => void;
}

const OUTPUT_SIZE = 1000;
const PADDING_RATIO = 0.08;
const ALPHA_THRESHOLD = 24;
const MAX_INPUT_SIZE = 1500;

function getAlphaBoundingBox(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Tidak dapat membaca hasil penghapusan background.');

  context.drawImage(image, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function normalizeGarment(image: HTMLImageElement, box: NonNullable<ReturnType<typeof getAlphaBoundingBox>>) {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tidak dapat menyiapkan kanvas hasil.');

  const targetSize = OUTPUT_SIZE * (1 - PADDING_RATIO * 2);
  const scale = Math.min(targetSize / box.width, targetSize / box.height);
  const width = box.width * scale;
  const height = box.height * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    box.x,
    box.y,
    box.width,
    box.height,
    (OUTPUT_SIZE - width) / 2,
    (OUTPUT_SIZE - height) / 2,
    width,
    height
  );
  return canvas;
}

function resizeForProcessing(file: File): Promise<Blob> {
  return createImageBitmap(file).then((bitmap) => {
    const scale = Math.min(1, MAX_INPUT_SIZE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('Tidak dapat menyiapkan foto untuk diproses.');
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Tidak dapat mengecilkan ukuran foto.'));
      }, 'image/jpeg', 0.92);
    });
  });
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Tidak dapat membuka hasil gambar.'));
    };
    image.src = url;
  });
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Tidak dapat membuat PNG hasil.'));
    }, 'image/png');
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Tidak dapat membaca PNG hasil.'));
    reader.onerror = () => reject(reader.error || new Error('Tidak dapat membaca PNG hasil.'));
    reader.readAsDataURL(blob);
  });
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSaveItem }) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ClothingCategory>('Atasan');
  const [subCategory, setSubCategory] = useState('');
  const [color, setColor] = useState('');
  const [hexColor, setHexColor] = useState('#171717');
  const [material, setMaterial] = useState('');
  const [style, setStyle] = useState('Minimalist Casual');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('M');
  const [purchasePrice, setPurchasePrice] = useState<number>(250000);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle file select
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('File harus berupa gambar.');
      return;
    }

    setIsAnalyzing(true);
    setImagePreview(null);
    setErrorMsg(null);
    try {
      setProcessingStage('Menghapus background...');
      const inputBlob = await resizeForProcessing(file);
      const transparentBlob = await removeBackground(inputBlob, {
        output: { format: 'image/png' },
        progress: (_key, current, total) => {
          if (total > 0) setProcessingStage(`Menghapus background... ${Math.round((current / total) * 100)}%`);
        },
      });

      setProcessingStage('Mendeteksi pakaian...');
      const transparentImage = await loadImage(transparentBlob);
      const box = getAlphaBoundingBox(transparentImage);
      if (!box) throw new Error('Pakaian tidak terdeteksi. Coba foto yang lebih jelas.');

      setProcessingStage('Menyesuaikan ukuran...');
      const normalizedBlob = await canvasToPng(normalizeGarment(transparentImage, box));
      const base64 = await blobToDataUrl(normalizedBlob);
      setImagePreview(base64);
      setProcessingStage('Menganalisis pakaian dengan Gemini AI...');
      await triggerAiAnalysis(base64);
    } catch (err) {
      console.error('Garment processing failed:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    } finally {
      setIsAnalyzing(false);
      setProcessingStage('');
      e.target.value = '';
    }
  };

  // Trigger Gemini AI auto-tagging
  const triggerAiAnalysis = async (imageBase64: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/analyze-clothing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });

      if (!res.ok) throw new Error('Gagal menganalisis gambar pakaian');
      const data = await res.json();

      if (data.name) setName(data.name);
      if (data.category && ['Atasan', 'Bawahan', 'Terusan', 'Luaran', 'Sepatu', 'Aksesoris'].includes(data.category)) {
        setCategory(data.category as ClothingCategory);
      }
      if (data.subCategory) setSubCategory(data.subCategory);
      if (data.color) setColor(data.color);
      if (data.hexColor) setHexColor(data.hexColor);
      if (data.material) setMaterial(data.material);
      if (data.style) setStyle(data.style);
    } catch (err: any) {
      console.error('AI analysis failed:', err);
      // Show error to user so they know AI is not working
      setErrorMsg('⚠️ Gemini AI gagal menganalisis. Silakan isi detail secara manual, atau klik "Re-Analyze" untuk coba lagi.');
      // Only set minimal defaults so the form is usable
      if (!name) setName('Pakaian Baru');
    }
  };

  const handleReanalyze = async () => {
    if (!imagePreview) return;
    setIsAnalyzing(true);
    setProcessingStage('Menganalisis pakaian dengan Gemini AI...');
    try {
      await triggerAiAnalysis(imagePreview);
    } finally {
      setIsAnalyzing(false);
      setProcessingStage('');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePreview) {
      setErrorMsg('Silakan unggah foto pakaian terlebih dahulu');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('Nama pakaian tidak boleh kosong');
      return;
    }

    const newItem: ClothingItem = {
      id: `item-${Date.now()}`,
      name: name.trim(),
      category,
      subCategory: subCategory.trim() || 'Umum',
      color: color.trim() || 'Netral',
      hexColor: hexColor || '#171717',
      imageUrl: imagePreview,
      material: material.trim() || 'Katun',
      style: style.trim() || 'Minimalist Casual',
      purchasePrice: Number(purchasePrice) || 0,
      wearCount: 0,
      lastWornDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isFavorite: false,
      brand: brand.trim() || undefined,
      size: size.trim() || undefined,
    };

    onSaveItem(newItem);
    onClose();
  };

  const applyQuickTemplate = (templateUrl: string, templateName: string, cat: ClothingCategory, col: string, hex: string) => {
    setImagePreview(templateUrl);
    setName(templateName);
    setCategory(cat);
    setColor(col);
    setHexColor(hex);
    setSubCategory(templateName.split(' ')[0]);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#191919]/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="bg-[#F8F6EC] max-w-2xl w-full border border-[#C8D9A5] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#C8D9A5] flex items-center justify-between">
          <div>
            <h3 className="font-editorial text-2xl sm:text-3xl font-normal text-[#191919] mt-0.5">Tambah Pakaian ke Lemari</h3>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Tutup"
            title="Tutup"
            className="p-1 text-[#96948B] hover:text-[#191919] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-[#7A2117] text-[#F8F6EC] text-[11px] font-editorial-mono flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-[#F8F6EC] shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Photo Upload Zone */}
          <div>
            <div className="label mb-2">Foto Pakaian</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`relative border border-dashed p-4 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  imagePreview
                    ? 'border-[#C8D9A5] bg-white'
                    : 'border-[#C8D9A5] hover:border-[#C8D9A5] bg-[#F4F1E5]/40 hover:bg-white'
                }`}
                style={{ minHeight: '190px' }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                {imagePreview ? (
                  <div className="relative w-full h-44 flex items-center justify-center overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-full max-w-full object-contain"
                    />
                    <div className="absolute bottom-2 right-2 bg-[#7A2117] text-[#F8F6EC] text-[10px] font-editorial-mono px-2.5 py-1">
                      <span>Ganti</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4 space-y-2">
                    <div className="label">Drag atau klik untuk upload</div>
                    <p className="text-xs font-light text-[#96948B]">PNG, JPG, WEBP up to 10MB</p>
                  </div>
                )}

                {isAnalyzing && (
                  <div className="absolute inset-0 bg-[#F8F6EC]/95 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-[#191919] font-editorial-mono text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-[#191919]" />
                    <span>{processingStage || 'Memproses foto...'}</span>
                  </div>
                )}
              </div>

              {/* Quick Sample Presets */}
              <div className="bg-[#F4F1E5]/50 p-3.5 border border-[#C8D9A5] flex flex-col justify-between">
                <div>
                  <div className="label mb-2">Contoh Cepat</div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        applyQuickTemplate(
                          'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=500&q=80',
                          'Kaos Basic Katun Hitam',
                          'Atasan',
                          'Hitam',
                          '#0F172A'
                        )
                      }
                      className="p-2 bg-white border border-[#C8D9A5] hover:border-[#C8D9A5] text-left transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-6 h-6 bg-[#0F172A] shrink-0" />
                      <div className="truncate">
                        <p className="font-editorial text-sm text-[#191919] truncate leading-none">Kaos Hitam</p>
                        <p className="label text-[9px]">Atasan</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        applyQuickTemplate(
                          'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=500&q=80',
                          'Kemeja Sand Beige Linen',
                          'Atasan',
                          'Sand Beige',
                          '#E8DFD1'
                        )
                      }
                      className="p-2 bg-white border border-[#C8D9A5] hover:border-[#C8D9A5] text-left transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-6 h-6 bg-[#E8DFD1] border border-[#C8D9A5] shrink-0" />
                      <div className="truncate">
                        <p className="font-editorial text-sm text-[#191919] truncate leading-none">Kemeja Beige</p>
                        <p className="label text-[9px]">Atasan</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        applyQuickTemplate(
                          'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=500&q=80',
                          'Jeans Ripped Denim Vintage',
                          'Bawahan',
                          'Biru Indigo',
                          '#1E3A8A'
                        )
                      }
                      className="p-2 bg-white border border-[#C8D9A5] hover:border-[#C8D9A5] text-left transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-6 h-6 bg-[#1E3A8A] shrink-0" />
                      <div className="truncate">
                        <p className="font-editorial text-sm text-[#191919] truncate leading-none">Jeans Denim</p>
                        <p className="label text-[9px]">Bawahan</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        applyQuickTemplate(
                          'https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=500&q=80',
                          'Jaket Parka Olive Minimal',
                          'Luaran',
                          'Olive Sand',
                          '#4A5546'
                        )
                      }
                      className="p-2 bg-white border border-[#C8D9A5] hover:border-[#C8D9A5] text-left transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-6 h-6 bg-[#4A5546] shrink-0" />
                      <div className="truncate">
                        <p className="font-editorial text-sm text-[#191919] truncate leading-none">Jaket Olive</p>
                        <p className="label text-[9px]">Luaran</p>
                      </div>
                    </button>
                  </div>
                </div>

                {imagePreview && (
                  <button
                    type="button"
                    onClick={handleReanalyze}
                    disabled={isAnalyzing}
                    className="mt-3 w-full py-1.5 px-3 bg-[#7A2117] text-[#F8F6EC] hover:bg-[#7A2117] text-[10px] font-editorial-mono uppercase tracking-wider transition-colors"
                  >
                    <span>Re-Analyze dengan Gemini AI</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div>
            <div className="label mb-2">Detail Pakaian</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label block mb-1">Nama Pakaian *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Kemeja Linen Putih Oversized"
                  className="w-full px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="label block mb-1">Kategori Lemari *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ClothingCategory)}
                  className="w-full px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none cursor-pointer"
                >
                  <option value="Atasan">Atasan (Tops / Kemeja / Kaos)</option>
                  <option value="Bawahan">Bawahan (Celana / Rok / Jeans)</option>
                  <option value="Terusan">Terusan (Dress / Jumpsuit)</option>
                  <option value="Luaran">Luaran (Jaket / Blazer / Cardigan)</option>
                  <option value="Sepatu">Sepatu (Sneakers / Loafers / Boots)</option>
                  <option value="Aksesoris">Aksesoris (Topi / Jam / Tas)</option>
                </select>
              </div>

              <div>
                <label className="label block mb-1">Sub-Kategori</label>
                <input
                  type="text"
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                  placeholder="Misal: Kemeja, Chino, Knitwear"
                  className="w-full px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="label block mb-1">Warna Dominan</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hexColor}
                    onChange={(e) => setHexColor(e.target.value)}
                    className="w-8 h-8 p-0.5 border border-[#C8D9A5] cursor-pointer bg-white shrink-0"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Misal: Charcoal, Sand Beige"
                    className="flex-1 px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="label block mb-1">Bahan / Material</label>
                <input
                  type="text"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  placeholder="Misal: Katun Twill, Wol, Linen"
                  className="w-full px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="label block mb-1">Style / Karakter</label>
                <input
                  type="text"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="Misal: Minimalist Casual, Modern, Classic"
                  className="w-full px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="label block mb-1">Harga Beli (Rp) - Wear Tracking</label>
                <input
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(Number(e.target.value))}
                  placeholder="250000"
                  min={0}
                  step={5000}
                  className="w-full px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none font-editorial-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label block mb-1">Brand</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Uniqlo, COS, dll"
                    className="w-full px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Ukuran</label>
                  <input
                    type="text"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder="S, M, L, XL"
                    className="w-full px-3 py-2 text-xs border border-[#C8D9A5] focus:border-[#C8D9A5] bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#C8D9A5] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="label text-[#96948B] hover:text-[#191919] cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isAnalyzing}
              className="btn-upload disabled:opacity-50 disabled:cursor-not-allowed"
            >
              SAVE TO ARCHIVE
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
