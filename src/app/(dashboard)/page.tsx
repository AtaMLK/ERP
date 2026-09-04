'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Euro, AlertCircle, Truck, ArrowUpRight, Plus, FileText, Users, Package, Clock3, CircleAlert, CheckCircle2 } from 'lucide-react';

type Stats = { totalOrders?: number; totalRevenue?: number; outstandingAmount?: number; pendingShipments?: number };
type AlertRow = { type:string; order_id:number|null; order_number:string|null; customer_name:string; title:string; due_date:string|null; days_late:number|null; ordered_qty:number|null; shipped_qty:number|null };

const alertMeta: Record<string,{label:string;className:string}> = {
  late_shipping:{label:'Late shipping',className:'bg-red-50 text-red-700 border-red-200'},
  late_payment:{label:'Late payment',className:'bg-amber-50 text-amber-700 border-amber-200'},
  partial_shipment:{label:'Partial shipment',className:'bg-blue-50 text-blue-700 border-blue-200'},
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/reports/dashboard',{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Unable to load dashboard.');return d.data||{};}),
      fetch('/api/alerts',{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Unable to load alerts.');return d.data||[];})
    ]).then(([s,a])=>{setStats(s);setAlerts(a);}).catch(e=>setError(e instanceof Error?e.message:'Unable to load dashboard.'));
  },[]);

  const cards = [
    ['Orders', stats?.totalOrders ?? '—', ShoppingCart, '/orders'],
    ['Revenue', stats ? `€${Number(stats.totalRevenue || 0).toLocaleString()}` : '—', Euro, '/invoices'],
    ['Outstanding', stats ? `€${Number(stats.outstandingAmount || 0).toLocaleString()}` : '—', AlertCircle, '/payments'],
    ['Pending shipments', stats?.pendingShipments ?? '—', Truck, '/shipments'],
  ] as const;

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-indigo-600">FZ ERP</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Business overview</h1><p className="mt-1 text-sm text-slate-500">Track the complete commercial, logistics and finance lifecycle.</p></div><Link href="/orders" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"><Plus size={17}/> New order</Link></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([name,value,Icon,href])=><Link href={href} key={name} className="group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><div className="rounded-xl bg-slate-100 p-2.5"><Icon size={19}/></div><ArrowUpRight size={17} className="text-slate-300 transition group-hover:text-indigo-500"/></div><p className="mt-5 text-sm text-slate-500">{name}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p></Link>)}</div>

    <section className="rounded-2xl border bg-white shadow-sm"><div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><CircleAlert size={18}/><h2 className="font-semibold">Action required</h2>{alerts.length>0&&<span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{alerts.length}</span>}</div><p className="mt-1 text-sm text-slate-500">Late shipping, overdue customer payments and incomplete shipments.</p></div><Clock3 size={18} className="text-slate-400"/></div><div className="divide-y">{alerts.length===0?<div className="flex items-center gap-3 p-6 text-sm text-slate-500"><CheckCircle2 size={18}/> No operational alerts right now.</div>:alerts.slice(0,12).map((a,i)=>{const meta=alertMeta[a.type]||alertMeta.late_shipping;return <div key={`${a.type}-${a.order_id}-${i}`} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.className}`}>{meta.label}</span>{a.order_number&&<span className="text-sm font-semibold text-slate-900">{a.order_number}</span>}<span className="text-sm text-slate-500">{a.customer_name}</span></div><p className="mt-1 text-sm text-slate-700">{a.title}{a.days_late!=null&&` · ${a.days_late} day${a.days_late===1?'':'s'} late`}{a.type==='partial_shipment'&&` · ${Number(a.shipped_qty||0).toLocaleString()} / ${Number(a.ordered_qty||0).toLocaleString()} shipped`}</p></div>{a.order_id&&<Link href={`/orders/${a.order_id}`} className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800">Open order →</Link>}</div>})}</div></section>

    <div className="grid gap-4 lg:grid-cols-3"><div className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2"><div><h2 className="font-semibold">Quick actions</h2><p className="mt-1 text-sm text-slate-500">Jump directly into common operations.</p></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[['/orders','New Order',ShoppingCart],['/offers','New Price Offer',FileText],['/customers','New Customer',Users]].map(([href,title,Icon]:any)=><Link href={href} key={title} className="group rounded-xl border p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"><Icon size={18}/><p className="mt-3 text-sm font-medium">{title}<ArrowUpRight size={14} className="ml-1 inline transition group-hover:translate-x-0.5"/></p></Link>)}</div></div><div className="rounded-2xl bg-slate-950 p-6 text-white"><div className="flex items-center gap-2 text-sm text-slate-400"><Package size={16}/> System</div><h2 className="mt-3 text-lg font-semibold">Operations workspace</h2><p className="mt-2 text-sm leading-6 text-slate-400">One place to follow inquiries, offers, orders, shipments, invoices and payments.</p><div className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-500">Secure sessions · Server authorization · Audit trail</div></div></div>
  </div>;
}
