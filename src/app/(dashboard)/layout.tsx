'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, ShoppingCart, FileText, Users, Building2, Package, Truck, CreditCard, BarChart3, Settings, LogOut, Languages, Menu, X } from 'lucide-react';

const items = [
  ['/', 'Dashboard', LayoutDashboard], ['/orders', 'Orders', ShoppingCart], ['/offers', 'Price Offers', FileText],
  ['/customers', 'Customers', Users], ['/suppliers', 'Suppliers', Building2], ['/products', 'Products', Package],
  ['/invoices', 'Invoices', FileText], ['/payments', 'Payments', CreditCard], ['/shipments', 'Shipments', Truck],
  ['/reports', 'Reports', BarChart3], ['/settings/currencies', 'Currencies', Settings],
] as const;

const tr: Record<string, string> = { Dashboard:'Panel', Orders:'Siparişler', 'Price Offers':'Teklifler', Customers:'Müşteriler', Suppliers:'Tedarikçiler', Products:'Ürünler', Invoices:'Faturalar', Payments:'Ödemeler', Shipments:'Sevkiyatlar', Reports:'Raporlar', Currencies:'Kurlar' };

export default function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [lang, setLang] = useState('en');
  const path = usePathname();
  const router = useRouter();

  useEffect(() => { setLang(localStorage.getItem('fz_lang') || 'en'); }, []);
  useEffect(() => { setMobile(false); }, [path]);

  function changeLanguage() {
    const next = lang === 'en' ? 'tr' : 'en';
    setLang(next); localStorage.setItem('fz_lang', next);
  }

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }

  const sidebar = (
    <aside className={`fixed inset-y-0 left-0 z-50 border-r bg-white shadow-sm transition-all duration-200 ${open ? 'w-64' : 'w-20'} ${mobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="flex h-16 items-center border-b px-5">
        <div className="font-bold text-xl">FZ<span className="text-indigo-600">ERP</span></div>
      </div>
      <nav className="space-y-1 p-3">
        {items.map(([href, label, Icon]) => {
          const active = path === href || (href !== '/' && path.startsWith(href));
          return <Link key={href} href={href} title={label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}><Icon size={18} />{open && <span>{lang === 'tr' ? tr[label] || label : label}</span>}</Link>;
        })}
      </nav>
      <div className="absolute bottom-3 left-0 right-0 space-y-1 p-3">
        <button onClick={changeLanguage} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"><Languages size={18}/>{open && (lang === 'en' ? 'Türkçe' : 'English')}</button>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600"><LogOut size={18}/>{open && (lang === 'tr' ? 'Çıkış' : 'Sign out')}</button>
      </div>
    </aside>
  );

  return <div className="min-h-screen bg-slate-50">
    {sidebar}
    {mobile && <button aria-label="Close navigation" onClick={() => setMobile(false)} className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden" />}
    <div className={`${open ? 'lg:ml-64' : 'lg:ml-20'} transition-all duration-200`}>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <button aria-label="Open navigation" onClick={() => window.innerWidth < 1024 ? setMobile(true) : setOpen(!open)} className="rounded-lg p-2 hover:bg-slate-100">{open ? <X size={19}/> : <Menu size={19}/>}</button>
          <span className="hidden text-sm font-medium text-slate-500 sm:block">{lang === 'tr' ? 'FZ ERP Yönetim Sistemi' : 'FZ ERP Management System'}</span>
        </div>
        <div className="text-xs font-medium text-slate-400">{lang === 'tr' ? 'İç sistem' : 'Internal system'}</div>
      </header>
      <main className="mx-auto max-w-[1600px] p-4 sm:p-6">{children}</main>
    </div>
  </div>;
}
