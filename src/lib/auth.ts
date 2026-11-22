import type { AuthError, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export function toAuthUser(user: User): AuthUser {
  const email = user.email ?? '';
  const name = (user.user_metadata?.name as string | undefined)?.trim() || email.split('@')[0];
  return { id: user.id, name, email, createdAt: user.created_at };
}

function translateError(error: AuthError): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Email atau kata sandi salah.';
  if (msg.includes('email not confirmed')) return 'Email belum dikonfirmasi. Silakan cek inbox Anda.';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Email sudah terdaftar.';
  if (msg.includes('password should be')) return 'Kata sandi terlalu lemah (minimal 6 karakter).';
  if (msg.includes('rate limit') || error.status === 429) return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
  if (msg.includes('invalid') && msg.includes('email')) return 'Format email tidak valid.';
  if (msg.includes('failed to fetch')) return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  return error.message;
}

/** Returns the new user and whether they must confirm their email before logging in. */
export async function signUp(payload: { name: string; email: string; password: string }) {
  const { data, error } = await supabase.auth.signUp({
    email: payload.email.trim(),
    password: payload.password,
    options: { data: { name: payload.name.trim() } },
  });
  if (error) throw new Error(translateError(error));
  // Supabase returns a user with no identities when the email is already registered
  // (to avoid leaking which emails exist when confirmation is on).
  if (data.user && data.user.identities?.length === 0) throw new Error('Email sudah terdaftar.');
  if (!data.user) throw new Error('Registrasi gagal.');
  return { user: toAuthUser(data.user), needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(translateError(error));
  return toAuthUser(data.user);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Calls `cb` with the current user now and on every auth change. Returns an unsubscribe fn. */
export function onAuthUserChange(cb: (user: AuthUser | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ? toAuthUser(session.user) : null);
  });
  return () => data.subscription.unsubscribe();
}
