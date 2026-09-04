'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Euro, AlertCircle, Truck, ArrowUpRight, Plus, FileText, Users, Package } from 'lucide-react';

type Stats = { totalOrders?: number; totalRevenue?: number; outstandingAmount?: number; pendingShipments?: number };

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/reports/dashboard', { cache: 'no-store' }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Unable to load dashboard.'); setStats(d.data || {}); }).catch(e => setError(e instanceof Error ? e.message : 'Unable to load dashboard.')); }, []);

  const cards = [
    ['Orders', stats?.totalOrders ?? '—', ShoppingCart, '/orders'],
    ['Revenue', stats ? `€${Number(stats.totalRevenue || 0).toLocaleString()}` : '—', Euro, '/invoices'],
    ['Outstanding', stats ? `€${Number(stats.outstandingAmount || 0).toLocaleString()}` : '—', AlertCircle, '/payments'],
    ['Pending shipments', stats?.pendingShipments ?? '—', Truck, '/shipments'],
  ] as const;

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-indigo-600">FZ ERP</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Business overview</h1><p className="mt-1 text-sm text-slate-500">Orders, finance and logistics at a glance.</p></div><Link href="/orders" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"><Plus size={17}/> New order</Link></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([name, value, Icon, href]) => <Link href={href} key={name} className="group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><div className="rounded-xl bg-slate-100 p-2.5"><Icon size={19}/></div><ArrowUpRight size={17} className="text-slate-300 transition group-hover:text-indigo-500"/></div><p className="mt-5 text-sm text-slate-500">{name}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p></Link>)}</div>
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Quick actions</h2><p className="mt-1 text-sm text-slate-500">Jump directly into common operations.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[['/orders','New Order',ShoppingCart],['/offers','New Price Offer',FileText],['/customers','New Customer',Users]].map(([href,title,Icon]: any) => <Link href={href} key={title} className="group rounded-xl border p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"><Icon size={18}/><p className="mt-3 text-sm font-medium">{title}<ArrowUpRight size={14} className="ml-1 inline transition group-hover:translate-x-0.5"/></p></Link>)}</div></div>
      <div className="rounded-2xl bg-slate-950 p-6 text-white"><div className="flex items-center gap-2 text-sm text-slate-400"><Package size={16}/> System</div><h2 className="mt-3 text-lg font-semibold">Operations workspace</h2><p className="mt-2 text-sm leading-6 text-slate-400">Your ERP is being built around controlled order, purchasing, finance and shipment workflows.</p><div className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-500">Secure sessions · Server authorization · Audit trail</div></div>
    </div>
  </div>;
}
