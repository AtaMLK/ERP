'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Truck, Search, ArrowUpRight } from 'lucide-react';

type Shipment={id:number;shipment_number:string;order_number:string;customer_name:string;status:string;shipment_date:string|null;expected_delivery:string|null;shipment_quantity:number};

export default function ShipmentsPage(){
 const [rows,setRows]=useState<Shipment[]>([]); const [q,setQ]=useState(''); const [loading,setLoading]=useState(true);
 async function load(){setLoading(true);const r=await fetch('/api/shipments');const j=await r.json();setRows(j.data||[]);setLoading(false)}
 useEffect(()=>{load()},[]);
 const filtered=rows.filter(x=>`${x.shipment_number} ${x.order_number} ${x.customer_name}`.toLowerCase().includes(q.toLowerCase()));
 return <div className="space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-semibold">Shipments</h1><p className="text-sm text-slate-500">Track partial, complete and over-shipments.</p></div><Link href="/shipments/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"><Plus size={17}/> New Shipment</Link></div><div className="relative max-w-md"><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search shipment, order or customer" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"/></div><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3">Shipment</th><th>Order</th><th>Customer</th><th>Status</th><th>Date</th><th>Expected</th><th className="text-right">Qty</th><th/></tr></thead><tbody>{loading?<tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>:filtered.map(s=><tr key={s.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium">{s.shipment_number}</td><td>{s.order_number}</td><td>{s.customer_name}</td><td><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{s.status}</span></td><td>{s.shipment_date?new Date(s.shipment_date).toLocaleDateString():'—'}</td><td>{s.expected_delivery?new Date(s.expected_delivery).toLocaleDateString():'—'}</td><td className="text-right">{Number(s.shipment_quantity).toLocaleString()}</td><td className="px-4 text-right"><Link href={`/shipments/${s.id}`} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">Open <ArrowUpRight size={15}/></Link></td></tr>)}</tbody></table></div></div>
}
