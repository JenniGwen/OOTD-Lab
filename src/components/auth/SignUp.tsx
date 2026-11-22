import React, { useState } from 'react';
import { signUp } from '../../lib/auth';

interface SignUpProps {
  onBack: () => void;
  onSwitchToSignIn: () => void;
  onRegisterSuccess: () => void;
}

export default function SignUp({ onBack, onSwitchToSignIn, onRegisterSuccess }: SignUpProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Kata sandi tidak cocok!');
      return;
    }

    setLoading(true);
    try {
      const { needsConfirmation } = await signUp({ name, email, password });
      if (needsConfirmation) {
        setConfirmSentTo(email.trim());
        return;
      }
      // Email confirmation is off: Supabase already signed the user in,
      // and App picks that up via onAuthUserChange.
      onRegisterSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrasi gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative z-[1] flex flex-col justify-between text-[#191919]">
      {/* Header Sederhana */}
      <header className="max-w-7xl w-full mx-auto h-20 px-4 sm:px-6 lg:px-8 flex justify-between items-center border-b border-[#C8D9A5]">
        <h1 className="font-brand text-3xl sm:text-4xl font-semibold italic tracking-tight">OOTD Lab.</h1>
        <button type="button" onClick={onBack} className="rounded-full px-4 py-2 text-xs font-medium text-[#96948B] hover:bg-[#F2F7E8] hover:text-[#191919] transition-colors cursor-pointer">
          Kembali ke Beranda
        </button>
      </header>

      {/* Konten Utama Form Register */}
      <main className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-md w-full bg-white p-8 md:p-10 rounded-2xl border border-[#C8D9A5]">

          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#191919]">Buat Akun Baru</h2>
            <p className="text-sm text-[#96948B] mt-2">Mulai simpan lemari virtual dan nikmati AI try-on.</p>
          </div>

          {confirmSentTo ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-[#191919]">
                Kami sudah mengirim link konfirmasi ke <strong>{confirmSentTo}</strong>. Buka email tersebut, klik
                link-nya, lalu masuk dengan akun Anda.
              </p>
              <button
                type="button"
                onClick={onSwitchToSignIn}
                className="w-full py-3.5 bg-[#7A2117] text-white rounded-full font-medium text-sm hover:bg-[#64190F] cursor-pointer transition-all"
              >
                Ke Halaman Masuk
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p role="alert" className="rounded-xl border border-[#7A2117]/30 bg-[#7A2117]/5 px-4 py-3 text-sm text-[#7A2117]">
                {error}
              </p>
            )}
            <div>
              <label className="block text-xs font-medium text-[#191919] mb-2">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama Anda"
                className="w-full px-4 py-3 bg-white border border-[#C8D9A5] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2117]/20 focus:border-[#7A2117] placeholder:text-[#96948B] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#191919] mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full px-4 py-3 bg-white border border-[#C8D9A5] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2117]/20 focus:border-[#7A2117] placeholder:text-[#96948B] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#191919] mb-2">
                Kata Sandi
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 karakter"
                className="w-full px-4 py-3 bg-white border border-[#C8D9A5] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2117]/20 focus:border-[#7A2117] placeholder:text-[#96948B] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#191919] mb-2">
                Konfirmasi Kata Sandi
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi kata sandi"
                className="w-full px-4 py-3 bg-white border border-[#C8D9A5] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#7A2117]/20 focus:border-[#7A2117] placeholder:text-[#96948B] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#7A2117] text-white rounded-full font-medium text-sm hover:bg-[#64190F] cursor-pointer transition-all mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Memproses…' : 'Daftar Sekarang'}
            </button>
          </form>
          )}

          {/* Garis Pembatas */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#C8D9A5]"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-[#96948B] font-medium">Atau daftar dengan</span>
            </div>
          </div>

          {/* Tombol OAuth Google */}
          <button
            type="button"
            className="w-full py-3 px-4 border border-[#C8D9A5] rounded-full text-sm font-medium text-[#191919] bg-white hover:bg-[#F2F7E8] cursor-pointer flex items-center justify-center gap-3 transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Google
          </button>

          <p className="text-center text-sm text-[#96948B] mt-6">
            Sudah punya akun?{' '}
            <button type="button" onClick={onSwitchToSignIn} className="text-[#7A2117] font-semibold hover:underline cursor-pointer">
              Masuk di sini
            </button>
          </p>

        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-xs text-[#96948B]">
        &copy; 2026 OOTD Lab. All rights reserved.
      </footer>
    </div>
  );
}