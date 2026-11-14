'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.session) {
          router.push('/dashboard');
        } else {
          setMessage({
            text: '¡Cuenta creada! Revisa tu correo o inicia sesión directamente.',
            type: 'success',
          });
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en la autenticación';
      setMessage({
        text: msg,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4 selection:bg-zinc-800">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 mb-4 shadow-xl">
            <svg
              className="w-7 h-7 text-emerald-400 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-100">
            Control de Inventario
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {isSignUp ? 'Crea tu cuenta de administrador' : 'Inicia sesión para acceder al panel'}
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7 sm:p-8 shadow-2xl backdrop-blur-xl">
          {message && (
            <div
              className={`p-3.5 mb-5 rounded-2xl text-xs sm:text-sm font-medium border flex items-center gap-2.5 ${
                message.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              }`}
            >
              <span>{message.type === 'error' ? '⚠️' : '✓'}</span>
              <span>{message.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ejemplo.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 mt-2 rounded-xl bg-zinc-100 text-zinc-950 font-semibold text-sm hover:bg-white active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
            >
              {isLoading
                ? 'Procesando...'
                : isSignUp
                ? 'Crear Cuenta'
                : 'Ingresar al Inventario'}
            </button>
          </form>

          {/* Toggle Tab */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setMessage(null);
              }}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition font-medium"
            >
              {isSignUp ? (
                <>¿Ya tienes cuenta? <span className="text-zinc-100 underline underline-offset-4">Inicia sesión</span></>
              ) : (
                <>¿No tienes cuenta? <span className="text-zinc-100 underline underline-offset-4">Regístrate como admin</span></>
              )}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-zinc-600 mt-6">
          Protegido por Supabase Authentication
        </p>
      </div>
    </div>
  );
}

