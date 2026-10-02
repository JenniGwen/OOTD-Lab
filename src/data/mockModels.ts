import { BodyModel } from '../types';

export const PRESET_BODY_MODELS: BodyModel[] = [
  {
    id: 'model-male-1',
    name: 'Model Pria (Athletic Casual)',
    gender: 'Pria',
    bodyType: 'Tinggi 178 cm, Bahu Proporsional',
    imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=700&q=80',
    description: 'Postur tegap netral, sangat ideal untuk fitting kemeja, kaos, jaket, dan celana slim/regular.',
    torsoBounds: {
      top: 24,
      left: 28,
      width: 44,
      height: 38,
    },
    bottomBounds: {
      top: 56,
      left: 31,
      width: 38,
      height: 40,
    },
  },
  {
    id: 'model-female-1',
    name: 'Model Wanita (Slim Chic)',
    gender: 'Wanita',
    bodyType: 'Tinggi 168 cm, Proporsi Ramping',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=80',
    description: 'Bahu terdefinisi dengan postur relaks, cocok untuk evaluasi drape kemeja linen, knitwear, dan blazer.',
    torsoBounds: {
      top: 25,
      left: 29,
      width: 42,
      height: 36,
    },
    bottomBounds: {
      top: 55,
      left: 32,
      width: 36,
      height: 40,
    },
  },
  {
    id: 'model-male-2',
    name: 'Model Pria (Urban Minimalist)',
    gender: 'Pria',
    bodyType: 'Tinggi 175 cm, Regular Fit',
    imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=80',
    description: 'Postur santai casual, cocok untuk outfit streetwear, denim, dan layered outerwear.',
    torsoBounds: {
      top: 23,
      left: 27,
      width: 46,
      height: 39,
    },
    bottomBounds: {
      top: 57,
      left: 30,
      width: 40,
      height: 39,
    },
  },
  {
    id: 'model-female-2',
    name: 'Model Wanita (Casual Smart)',
    gender: 'Wanita',
    bodyType: 'Tinggi 170 cm, Curvy Balanced',
    imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=80',
    description: 'Siluet natural untuk menguji fitting atasan boxy, blazer semi-formal, dan celana chino.',
    torsoBounds: {
      top: 26,
      left: 28,
      width: 44,
      height: 37,
    },
    bottomBounds: {
      top: 56,
      left: 30,
      width: 40,
      height: 40,
    },
  },
];
