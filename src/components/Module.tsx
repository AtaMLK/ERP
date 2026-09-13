'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2, X, AlertCircle } from 'lucide-react';

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'date' | 'datetime-local' | 'select';
  required?: boolean;
  options?: string[];
};

type Definition = {
  title: string;
  description: string;
  fields: Field[];
  creatable?: boolean;
  deletable?: boolean;
};

const definitions: Record<string, Definition> = {
  customers: {
    title: 'Customers', description: 'Manage B2B customers and their commercial details.', creatable: true, deletable: true,
    fields: [
      { key: 'customer_code', label: 'Customer code' }, { key: 'name', label: 'Company name', required: true },
      { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone' }, { key: 'city', label: 'City' },
      { key: 'country', label: 'Country' }, { key: 'vat_number', label: 'VAT number' }, { key: 'default_currency', label: 'Currency', required: true },
    ],
  },
  suppliers: {
    title: 'Suppliers', description: 'Manage suppliers and purchasing information.', creatable: true, deletable: true,
    fields: [
      { key: 'name', label: 'Company name', required: true }, { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone' }, { key: 'city', label: 'City' }, { key: 'country', label: 'Country' },
      { key: 'currency', label: 'Currency', required: true }, { key: 'payment_terms', label: 'Payment terms' },
    ],
  },
  products: {
    title: 'Products', description: 'Manage standard products, HS codes and pricing.', creatable: true, deletable: true,
    fields: [
      { key: 'name', label: 'Product name', required: true }, { key: 'sku', label: 'SKU', required: true },
      { key: 'product_name_en', label: 'English name' }, { key: 'product_name_tr', label: 'Turkish name' },
      { key: 'category', label: 'Category' }, { key: 'product_family', label: 'Product family' }, { key: 'hs_code', label: 'HS code' },
      { key: 'purchase_price', label: 'Purchase price', type: 'number' }, { key: 'sale_price', label: 'Sale price', type: 'number' },
      { key: 'currency', label: 'Currency', required: true },
    ],
  },
  orders: {
    title: 'Orders', description: 'Customer orders and their controlled lifecycle.', deletable: false,
    fields: [
      { key: 'order_number', label: 'Order' }, { key: 'customer_name', label: 'Customer' }, { key: 'status', label: 'Status' },
      { key: 'total_amount', label: 'Total' }, { key: 'currency', label: 'Currency' }, { key: 'item_count', label: 'Items' },
    ],
  },
  offers: {
    title: 'Price Offers', description: 'Commercial offers prepared for customers.', deletable: false,
    fields: [
      { key: 'offer_number', label: 'Offer' }, { key: 'customer_id', label: 'Customer' }, { key: 'status', label: 'Status' },
      { key: 'total_amount', label: 'Total' }, { key: 'currency', label: 'Currency' }, { key: 'valid_until', label: 'Valid until' },
    ],
  },
  invoices: {
    title: 'Invoices', description: 'Customer invoices and payment status.', deletable: false,
    fields: [
      { key: 'invoice_number', label: 'Invoice' }, { key: 'customer_id', label: 'Customer' }, { key: 'status', label: 'Status' },
      { key: 'total_amount', label: 'Total' }, { key: 'currency', label: 'Currency' }, { key: 'due_date', label: 'Due date' },
    ],
  },
  payments: {
    title: 'Payments', description: 'Recorded customer payments.', deletable: false,
    fields: [
      { key: 'invoice_number', label: 'Invoice' }, { key: 'customer_name', label: 'Customer' }, { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' }, { key: 'payment_date', label: 'Payment date' }, { key: 'payment_method', label: 'Method' },
    ],
  },
  shipments: {
    title: 'Shipments', description: 'Shipment execution and delivery tracking.', deletable: false,
    fields: [
      { key: 'shipment_number', label: 'Shipment' }, { key: 'order_id', label: 'Order' }, { key: 'status', label: 'Status' },
      { key: 'incoterm_code', label: 'Incoterm' }, { key: 'carrier', label: 'Carrier' }, { key: 'expected_delivery', label: 'Expected delivery' },
    ],
  },
  claims: {
    title: 'Claims', description: 'Customer claims, approvals and credit memos.', deletable: false,
    fields: [
      { key: 'order_id', label: 'Order' }, { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' },
    ],
  },
};

const fallback: Definition = { title: 'Module', description: 'ERP records.', fields: [] };

function formatValue(value: unknown, key: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (key.includes('date') || key.includes('until')) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString();
  }
  return String(value);
}

export default function Module({ params }: { params: { module: string } }) {
  const definition = definitions[params.module] || fallback;
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/${params.module}?limit=200`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load records.');
      setData(Array.isArray(payload.data) ? payload.data : []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load records.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [params.module]);

  const filtered = useMemo(() => data.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())), [data, query]);

  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const response = await fetch(`/api/${params.module}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to create record.');
      setOpen(false); setForm({}); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create record.'); }
  }

  async function remove(id: unknown) {
    if (!confirm('Delete this record? This action uses the server-side permission and deletion rules.')) return;
    setError('');
    try {
      const response = await fetch(`/api/${params.module}/${id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to delete record.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete record.'); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">{definition.title}</h1><p className="mt-1 text-sm text-slate-500">{definition.description}</p></div>
        {definition.creatable && <button onClick={() => { setError(''); setForm({}); setOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"><Plus size={17}/> New</button>}
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17} className="mt-0.5 shrink-0"/><span>{error}</span></div>}

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex gap-3 border-b p-4">
          <div className="relative max-w-md flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search records…" className="w-full rounded-xl border px-3 py-2.5 pl-9 text-sm outline-none focus:border-indigo-500"/></div>
          <button onClick={load} disabled={loading} className="rounded-xl border p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="Refresh"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-slate-50"><tr>{definition.fields.map((field) => <th key={field.key} className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-500">{field.label}</th>)}{definition.deletable && <th/>}</tr></thead>
            <tbody>{filtered.map((row) => <tr key={String(row.id)} className="border-t hover:bg-slate-50">{definition.fields.map((field) => <td key={field.key} className="whitespace-nowrap px-4 py-3">{formatValue(row[field.key], field.key)}</td>)}{definition.deletable && <td className="px-4 py-3 text-right"><button onClick={() => remove(row.id)} className="text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={16}/></button></td>}</tr>)}</tbody>
          </table>
          {loading ? <div className="py-16 text-center text-sm text-slate-400">Loading…</div> : !filtered.length ? <div className="py-16 text-center text-sm text-slate-400">No records found.</div> : null}
        </div>
      </div>

      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
        <form onSubmit={save} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">New {definition.title.slice(0, -1)}</h2><p className="text-xs text-slate-500">Required fields are validated again by the API.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></div>
          <div className="grid gap-4 sm:grid-cols-2">{definition.fields.map((field) => <label key={field.key} className="text-sm font-medium text-slate-700">{field.label}{field.required && <span className="text-red-500"> *</span>}
            {field.type === 'select' ? <select required={field.required} value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="mt-1.5 w-full rounded-xl border px-3 py-2.5"><option value="">Select…</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input required={field.required} type={field.type || 'text'} value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 outline-none focus:border-indigo-500"/>}
          </label>)}</div>
          <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm">Cancel</button><button className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">Create</button></div>
        </form>
      </div>}
    </div>
  );
}
