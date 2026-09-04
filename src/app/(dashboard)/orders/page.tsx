'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, ArrowUpRight, PackageCheck } from 'lucide-react';

type Order = {
  id: number;
  order_number: string;
  customer_name: string;
  status: string;
  requested_delivery_date: string | null;
  total_amount: number | string | null;
  currency: string;
  item_count: number;
  created_at: string;
};

const statuses = ['all','draft','supplier_ordered','proforma_sent','customer_confirmed','in_production','shipped','completed','canceled'];

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function statusClass(status: string) {
  const map: Record<string,string> = {
    draft: 'bg-slate-100 text-slate-700',
    supplier_ordered: 'bg-amber-50 text-amber-700',
    proforma_sent: 'bg-sky-50 text-sky-700',
    customer_confirmed: 'bg-indigo-50 text-indigo-700',
    in_production: 'bg-orange-50 text-orange-700',
    shipped: 'bg-violet-50 text-violet-700',
    completed: 'bg-emerald-50 text-emerald-700',
    canceled: 'bg-rose-50 text-rose-700',
  };
  return map[status] || 'bg-slate-100 text-slate-700';
}

export default function OrdersPage() {
  const [rows, setRows] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (status !== 'all') params.set('status', status);
        const res = await fetch(`/api/orders?${params.toString()}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Could not load orders');
        setRows(json.data || []);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, status]);

  const totalOpen = useMemo(() => rows.filter((r) => !['completed','canceled'].includes(r.status)).length, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Sales & Fulfillment</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Track customer orders from draft through production, shipment and completion.</p>
        </div>
        <Link href="/orders/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={17} /> New Order
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Visible orders</p><p className="mt-2 text-2xl font-semibold">{rows.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Open</p><p className="mt-2 text-2xl font-semibold">{totalOpen}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Completed</p><p className="mt-2 text-2xl font-semibold">{rows.filter((r) => r.status === 'completed').length}</p></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order number or customer..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-400" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400">
            {statuses.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : label(s)}</option>)}
          </select>
        </div>

        {error && <div className="m-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading orders...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center"><PackageCheck className="text-slate-300" size={32}/><p className="font-medium text-slate-700">No orders found</p><p className="text-sm text-slate-500">Create a new order or change the filters.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Requested delivery</th><th className="px-4 py-3 text-right">Items</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-950">{row.order_number}</td>
                    <td className="px-4 py-3 text-slate-700">{row.customer_name}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}>{label(row.status)}</span></td>
                    <td className="px-4 py-3 text-slate-600">{row.requested_delivery_date ? new Date(row.requested_delivery_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.item_count}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{Number(row.total_amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {row.currency}</td>
                    <td className="px-4 py-3 text-right"><Link href={`/orders/${row.id}`} className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"><ArrowUpRight size={16}/></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
