import { PoolClient } from 'pg';

export function normalizeProductReference(value: unknown): string {
  return String(value ?? '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, '');
}

function tokens(value:string){return value.toLowerCase().normalize('NFKC').split(/[^a-z0-9]+/).filter(Boolean)}
function similarity(a:string,b:string){
  if(!a||!b)return 0;
  if(a===b)return 100;
  if(a.includes(b)||b.includes(a))return 88;
  const aa=new Set(a),bb=new Set(b);const inter=[...aa].filter(x=>bb.has(x)).length;
  return Math.round((2*inter/(aa.size+bb.size))*80);
}
function tokenScore(a:string,b:string){
  const aa=tokens(a),bb=tokens(b);if(!aa.length||!bb.length)return 0;
  const matched=aa.filter(t=>bb.some(x=>x===t||x.includes(t)||t.includes(x))).length;
  return Math.round((matched/aa.length)*92);
}

export type Match={productId:number;sku:string;name:string;confidence:number;method:string};

export async function matchProduct(client:PoolClient, reference:string, customerId?:number):Promise<Match[]> {
  const raw=String(reference||'').trim(), n=normalizeProductReference(raw);if(!n)return [];
  const [products,aliases,customerSkus]=await Promise.all([
    client.query(`SELECT id,sku,COALESCE(product_name_en,name) name,product_name_tr,description FROM products WHERE deleted_at IS NULL ORDER BY id LIMIT 5000`),
    client.query(`SELECT product_id,alias FROM product_aliases WHERE regexp_replace(lower(alias),'[^a-z0-9]','','g') <> ''`),
    customerId?client.query(`SELECT customer_sku,master_product_id,supplier_sku FROM customer_products WHERE customer_id=$1 AND status='ACTIVE'`,[customerId]):Promise.resolve({rows:[] as any[]}),
  ]);

  const aliasMap=new Map<number,string[]>();for(const a of aliases.rows){const list=aliasMap.get(a.product_id)||[];list.push(String(a.alias));aliasMap.set(a.product_id,list)}
  const customerMap=new Map<number,{sku:string;supplierSku:string|null}>();for(const c of customerSkus.rows){if(c.master_product_id)customerMap.set(Number(c.master_product_id),{sku:String(c.customer_sku||''),supplierSku:c.supplier_sku?String(c.supplier_sku):null})}
  const out:Match[]=[];
  for(const p of products.rows){
    const sku=String(p.sku||''),name=String(p.name||''),tr=String(p.product_name_tr||'');
    let confidence=0,method='fuzzy';
    if(sku.toLowerCase()===raw.toLowerCase()){confidence=100;method='sku'}
    else if(normalizeProductReference(sku)===n){confidence=98;method='sku_normalized'}
    else if(n.includes(normalizeProductReference(sku))&&normalizeProductReference(sku).length>=3){confidence=97;method='sku_contains'}
    else {
      const aliasesFor=aliasMap.get(Number(p.id))||[];
      const customer=customerMap.get(Number(p.id));
      const aliasExact=aliasesFor.find(a=>normalizeProductReference(a)===n);
      const customerExact=customer?.sku&&normalizeProductReference(customer.sku)===n;
      const supplierExact=customer?.supplierSku&&normalizeProductReference(customer.supplierSku)===n;
      if(aliasExact){confidence=96;method='alias'}
      else if(customerExact){confidence=96;method='customer_sku'}
      else if(supplierExact){confidence=95;method='supplier_sku'}
      else {
        const nameScore=Math.max(tokenScore(raw,name),tokenScore(raw,tr),similarity(n,normalizeProductReference(name)));
        const aliasScore=Math.max(0,...aliasesFor.map(a=>Math.max(tokenScore(raw,a),similarity(n,normalizeProductReference(a)))));
        confidence=Math.max(nameScore,aliasScore);
        if(aliasScore>nameScore)method='alias_fuzzy';else method='name_fuzzy';
      }
    }
    if(confidence>=45)out.push({productId:Number(p.id),sku,name,confidence,method});
  }
  return out.sort((a,b)=>b.confidence-a.confidence).slice(0,10);
}

export function classifyConfidence(score:number){return score>=95?'HIGH':score>=75?'MEDIUM':'LOW'}
