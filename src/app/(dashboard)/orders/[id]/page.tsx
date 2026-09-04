'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Truck, CircleDollarSign, History, PackageCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';

type Shipment = { id:number; shipment_number:string; status:string; shipment_date:string|null; expected_delivery:string|null; carrier:string|null; tracking_number:string|null; quantity:number|string };
type Item = { id:number; productId:number; productName:string; sku:string; quantity:number; shippedQuantity:number; remainingQuantity:number; varianceQuantity:number; fulfillmentStatus:string; unitSalePrice:number|string; totalSalePrice:number|string; currency:string; shipments:Shipment[] };
type Invoice = { id:number; invoice_number:string; status:string; total_amount:number; paid_amount:number; remaining_amount:number; currency:string; due_date:string|null };
type StatusHistory = { id:number; from_status:string|null; to_status:string; created_at:string; changed_by_name:string|null };
type Order = { id:number; order_number:string; customer_name:string; customer_email:string|null; customer_order_number:string|null; customer_order_date:string|null; requested_delivery_date:string|null; status:string; total_amount:number|string; currency:string; notes:string|null; inquiry_number:string|null; offer_number:string|null; items:Item[]; invoices:Invoice[]; statusHistory:StatusHistory[] };

const transitions:Record<string,string[]>={draft:['supplier_ordered','canceled'],supplier_ordered:['proforma_sent','canceled'],proforma_sent:['customer_confirmed','canceled'],customer_confirmed:['in_production','canceled'],in_production:['shipped','canceled'],shipped:['completed'],completed:[],canceled:[]};
const stages=['draft','supplier_ordered','proforma_sent','customer_confirmed','in_production','shipped','completed'];

function label(v:string){return v.replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());}
function fmtDate(v:string|null){return v?new Date(v).toLocaleDateString():'—';}

export default function OrderDetailPage(){
  const params=useParams<{id:string}>();
  const [order,setOrder]=useState<Order|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function load(){
    setLoading(true);setError('');
    try{const res=await fetch(`/api/orders/${params.id}`,{cache:'no-store'});const json=await res.json();if(!res.ok||!json.success)throw new Error(json.error||'Could not load order');setOrder(json.data);}catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[params.id]);

  async function changeStatus(status:string){
    setBusy(true);setError('');
    try{const res=await fetch(`/api/orders/${params.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});const json=await res.json();if(!res.ok||!json.success)throw new Error(json.error||'Could not update status');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }

  const fulfilled=useMemo(()=>order?.items.filter(i=>i.shippedQuantity>=i.quantity).length||0,[order]);
  const overShipped=useMemo(()=>order?.items.filter(i=>i.shippedQuantity>i.quantity).length||0,[order]);
  const outstanding=useMemo(()=>order?.invoices.reduce((sum,i)=>sum+i.remaining_amount,0)||0,[order]);

  if(loading)return <div className="p-10 text-center text-sm text-slate-500">Loading order...</div>;
  if(!order)return <div className="space-y-4"><Link href="/orders" className="text-sm text-slate-600">← Back to orders</Link><div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error||'Order not found'}</div></div>;

  const stageIndex=stages.indexOf(order.status);

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <Link href="/orders" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-950"><ArrowLeft size={16}/> Orders</Link>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-slate-950">{order.order_number}</h1><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{label(order.status)}</span></div>
        <p className="mt-1 text-sm text-slate-500">{order.customer_name}{order.customer_order_number?` · Customer PO ${order.customer_order_number}`:''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {transitions[order.status]?.map(status=><button key={status} disabled={busy} onClick={()=>changeStatus(status)} className={`rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${status==='canceled'?'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50':'bg-slate-950 text-white hover:bg-slate-800'}`}>{busy?'Updating...':label(status)}</button>)}
      </div>
    </div>

    {error&&<div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5">
      <div className="min-w-[760px] flex items-center">
        {stages.map((stage,index)=><div key={stage} className="flex flex-1 items-center last:flex-none"><div className="flex flex-col items-center gap-2"><div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${index<stageIndex||order.status==='completed'?'border-emerald-500 bg-emerald-500 text-white':index===stageIndex?'border-slate-950 bg-slate-950 text-white':'border-slate-200 bg-white text-slate-400'}`}>{index<stageIndex||order.status==='completed'?<CheckCircle2 size={16}/>:index+1}</div><span className="whitespace-nowrap text-xs text-slate-500">{label(stage)}</span></div>{index<stages.length-1&&<div className={`mx-2 h-px flex-1 ${index<stageIndex?'bg-emerald-400':'bg-slate-200'}`}/>}</div>)}
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Order total</p><p className="mt-2 text-xl font-semibold">{Number(order.total_amount||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {order.currency}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Fulfilled lines</p><p className="mt-2 text-xl font-semibold">{fulfilled} / {order.items.length}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Outstanding</p><p className="mt-2 text-xl font-semibold">{outstanding.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {order.currency}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Over-shipped lines</p><p className={`mt-2 text-xl font-semibold ${overShipped?'text-amber-700':''}`}>{overShipped}</p></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.6fr_.8fr]">
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">Item fulfillment</h2><p className="text-sm text-slate-500">Cumulative shipment tracking per order item.</p></div><Truck size={19} className="text-slate-400"/></div>
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Ordered</th><th className="px-4 py-3 text-right">Shipped</th><th className="px-4 py-3 text-right">Remaining</th><th className="px-4 py-3 text-right">Variance</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{order.items.map(item=><tr key={item.id}><td className="px-4 py-3"><p className="font-medium text-slate-900">{item.productName}</p><p className="text-xs text-slate-500">{item.sku}</p>{item.shipments?.length>0&&<div className="mt-2 space-y-1">{item.shipments.map(s=><p key={`${s.id}-${item.id}`} className="text-xs text-slate-500">{s.shipment_number}: {Number(s.quantity).toLocaleString()} · {fmtDate(s.shipment_date)}</p>)}</div>}</td><td className="px-4 py-3 text-right tabular-nums">{item.quantity.toLocaleString()}</td><td className="px-4 py-3 text-right tabular-nums">{item.shippedQuantity.toLocaleString()}</td><td className="px-4 py-3 text-right tabular-nums">{item.remainingQuantity.toLocaleString()}</td><td className={`px-4 py-3 text-right tabular-nums ${item.varianceQuantity>0?'font-medium text-amber-700':''}`}>{item.varianceQuantity>0?'+':''}{item.varianceQuantity.toLocaleString()}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.fulfillmentStatus==='fulfilled'?'bg-emerald-50 text-emerald-700':item.fulfillmentStatus==='over_shipped'?'bg-amber-50 text-amber-700':item.fulfillmentStatus==='partial'?'bg-sky-50 text-sky-700':'bg-slate-100 text-slate-600'}`}>{label(item.fulfillmentStatus)}</span></td></tr>)}</tbody></table></div>
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><PackageCheck size={18}/> Order details</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Requested delivery</dt><dd className="font-medium text-right">{fmtDate(order.requested_delivery_date)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Customer order date</dt><dd className="font-medium text-right">{fmtDate(order.customer_order_date)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Inquiry</dt><dd className="font-medium text-right">{order.inquiry_number||'—'}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Offer</dt><dd className="font-medium text-right">{order.offer_number||'—'}</dd></div></dl>{order.notes&&<p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{order.notes}</p>}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><CircleDollarSign size={18}/> Invoices & payments</h2>{order.invoices.length===0?<p className="mt-4 text-sm text-slate-500">No customer invoice yet.</p>:<div className="mt-4 space-y-3">{order.invoices.map(inv=><div key={inv.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{inv.invoice_number}</p><span className="text-xs text-slate-500">{inv.status}</span></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Paid {inv.paid_amount.toLocaleString()} {inv.currency}</span><span>Remaining {inv.remaining_amount.toLocaleString()} {inv.currency}</span></div>{inv.remaining_amount>0&&<div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle size={13}/> Open balance</div>}</div>)}</div>}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><History size={18}/> Status history</h2><div className="mt-4 space-y-4">{order.statusHistory.map(h=><div key={h.id} className="relative border-l border-slate-200 pl-4"><div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-400"/><p className="text-sm font-medium text-slate-800">{label(h.to_status)}</p><p className="text-xs text-slate-500">{new Date(h.created_at).toLocaleString()}{h.changed_by_name?` · ${h.changed_by_name}`:''}</p></div>)}</div></section>
      </div>
    </div>
  </div>;
}
