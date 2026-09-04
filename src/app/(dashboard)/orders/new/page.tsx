'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

type Customer={id:number;name:string;default_currency?:string};
type Product={id:number;name:string;sku:string;purchase_price?:number|string;sale_price?:number|string;currency?:string};
type Line={productId:string;quantity:string;unitPurchasePrice:string;unitSalePrice:string};

const emptyLine=():Line=>({productId:'',quantity:'1',unitPurchasePrice:'0',unitSalePrice:'0'});

export default function NewOrderPage(){
  const router=useRouter();
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [products,setProducts]=useState<Product[]>([]);
  const [customerId,setCustomerId]=useState('');
  const [customerOrderNumber,setCustomerOrderNumber]=useState('');
  const [customerOrderDate,setCustomerOrderDate]=useState('');
  const [requestedDeliveryDate,setRequestedDeliveryDate]=useState('');
  const [currency,setCurrency]=useState('EUR');
  const [notes,setNotes]=useState('');
  const [lines,setLines]=useState<Line[]>([emptyLine()]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    Promise.all([fetch('/api/customers'),fetch('/api/products')]).then(async([c,p])=>{
      const cj=await c.json();const pj=await p.json();
      if(c.ok&&cj.success)setCustomers(cj.data||[]);
      if(p.ok&&pj.success)setProducts(pj.data||[]);
    }).catch(()=>setError('Could not load customers or products'));
  },[]);

  function setLine(index:number,patch:Partial<Line>){setLines(current=>current.map((line,i)=>i===index?{...line,...patch}:line));}
  function selectProduct(index:number,productId:string){
    const product=products.find(p=>String(p.id)===productId);
    setLine(index,{productId,unitPurchasePrice:String(product?.purchase_price??0),unitSalePrice:String(product?.sale_price??0)});
  }

  const total=useMemo(()=>lines.reduce((sum,l)=>sum+(Number(l.quantity)||0)*(Number(l.unitSalePrice)||0),0),[lines]);

  async function submit(e:React.FormEvent){
    e.preventDefault();setSaving(true);setError('');
    try{
      if(!customerId)throw new Error('Select a customer');
      const items=lines.map(l=>({productId:Number(l.productId),quantity:Number(l.quantity),unitPurchasePrice:Number(l.unitPurchasePrice),unitSalePrice:Number(l.unitSalePrice)}));
      if(items.some(i=>!Number.isInteger(i.productId)||i.quantity<=0))throw new Error('Each line requires a product and quantity greater than zero');
      const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerId:Number(customerId),customerOrderNumber:customerOrderNumber||null,customerOrderDate:customerOrderDate||null,requestedDeliveryDate:requestedDeliveryDate||null,currency,notes:notes||null,items})});
      const json=await res.json();if(!res.ok||!json.success)throw new Error(json.error||'Could not create order');
      router.push(`/orders/${json.data.id}`);router.refresh();
    }catch(e){setError((e as Error).message);}finally{setSaving(false);}
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><Link href="/orders" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-950"><ArrowLeft size={16}/> Orders</Link><h1 className="text-2xl font-semibold tracking-tight">New Order</h1><p className="mt-1 text-sm text-slate-500">Create the customer order with price snapshots that stay unchanged later.</p></div>
    {error&&<div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Order information</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm"><span className="mb-1.5 block text-slate-600">Customer *</span><select value={customerId} onChange={e=>{setCustomerId(e.target.value);const c=customers.find(x=>String(x.id)===e.target.value);if(c?.default_currency)setCurrency(c.default_currency);}} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1.5 block text-slate-600">Customer PO number</span><input value={customerOrderNumber} onChange={e=>setCustomerOrderNumber(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>
          <label className="text-sm"><span className="mb-1.5 block text-slate-600">Currency</span><select value={currency} onChange={e=>setCurrency(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option>EUR</option><option>USD</option><option>TRY</option><option>GBP</option></select></label>
          <label className="text-sm"><span className="mb-1.5 block text-slate-600">Customer order date</span><input type="date" value={customerOrderDate} onChange={e=>setCustomerOrderDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>
          <label className="text-sm"><span className="mb-1.5 block text-slate-600">Requested delivery</span><input type="date" value={requestedDeliveryDate} onChange={e=>setRequestedDeliveryDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>
          <label className="text-sm md:col-span-2 xl:col-span-1"><span className="mb-1.5 block text-slate-600">Notes</span><input value={notes} onChange={e=>setNotes(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold">Order items</h2><p className="text-sm text-slate-500">Purchase and sale prices are saved on each order line.</p></div><button type="button" onClick={()=>setLines(v=>[...v,emptyLine()])} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"><Plus size={16}/> Add line</button></div>
        <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 w-28">Qty</th><th className="px-4 py-3 w-40">Purchase</th><th className="px-4 py-3 w-40">Sale</th><th className="px-4 py-3 w-32 text-right">Margin</th><th className="px-4 py-3 w-40 text-right">Line total</th><th className="w-14"></th></tr></thead><tbody className="divide-y divide-slate-100">{lines.map((line,index)=>{const purchase=Number(line.unitPurchasePrice)||0;const sale=Number(line.unitSalePrice)||0;const margin=sale?((sale-purchase)/sale)*100:0;return <tr key={index}><td className="px-4 py-3"><select value={line.productId} onChange={e=>selectProduct(index,e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-2"><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></td><td className="px-4 py-3"><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={e=>setLine(index,{quantity:e.target.value})} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-right"/></td><td className="px-4 py-3"><input type="number" min="0" step="0.01" value={line.unitPurchasePrice} onChange={e=>setLine(index,{unitPurchasePrice:e.target.value})} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-right"/></td><td className="px-4 py-3"><input type="number" min="0" step="0.01" value={line.unitSalePrice} onChange={e=>setLine(index,{unitSalePrice:e.target.value})} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-right"/></td><td className="px-4 py-3 text-right tabular-nums">{margin.toFixed(1)}%</td><td className="px-4 py-3 text-right font-medium tabular-nums">{((Number(line.quantity)||0)*sale).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {currency}</td><td className="px-2 py-3 text-center"><button type="button" disabled={lines.length===1} onClick={()=>setLines(v=>v.filter((_,i)=>i!==index))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 size={16}/></button></td></tr>})}</tbody></table></div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-4"><div className="text-right"><p className="text-xs uppercase tracking-wide text-slate-500">Order total</p><p className="mt-1 text-xl font-semibold">{total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {currency}</p></div></div>
      </section>
      <div className="flex justify-end gap-3"><Link href="/orders" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium">Cancel</Link><button disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving?'Creating...':'Create Order'}</button></div>
    </form>
  </div>;
}
