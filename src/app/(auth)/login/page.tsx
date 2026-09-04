'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to sign in.');
      router.replace('/'); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }

  return <main className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
    <section className="hidden flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
      <div><div className="text-2xl font-bold tracking-tight">FZ<span className="text-indigo-400">ERP</span></div><h2 className="mt-12 max-w-lg text-4xl font-semibold leading-tight">One workspace for your orders, purchasing, finance and logistics.</h2><p className="mt-5 max-w-md text-sm leading-6 text-slate-400">Secure internal operations with controlled workflows, financial snapshots and shipment tracking.</p></div>
      <div className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole size={14}/> Private business system</div>
    </section>
    <section className="flex items-center justify-center p-6 sm:p-10">
      <form onSubmit={submit} className="w-full max-w-md space-y-7">
        <div className="lg:hidden text-2xl font-bold tracking-tight">FZ<span className="text-indigo-600">ERP</span></div>
        <div><p className="text-sm font-medium text-indigo-600">Management workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h1><p className="mt-2 text-sm text-slate-500">Sign in to continue to your ERP.</p></div>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Email<input autoComplete="email" required type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
          <label className="block text-sm font-medium text-slate-700">Password<input autoComplete="current-password" required type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
        </div>
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Signing in…' : <>Sign in <ArrowRight size={17}/></>}</button>
        <p className="text-center text-xs text-slate-400">Authorized users only.</p>
      </form>
    </section>
  </main>;
}
