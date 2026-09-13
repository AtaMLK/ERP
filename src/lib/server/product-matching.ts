import { PoolClient } from 'pg';

export function normalizeProductReference(value: unknown): string {
  return String(value ?? '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, '');
}
function similarity(a:string,b:string){if(!a||!b)return 0;if(a===b)return 100;if(a.includes(b)||b.includes(a))return 88;const aa=new Set(a),bb=new Set(b);const inter=[...aa].filter(x=>bb.has(x)).length;return Math.round((2*inter/(aa.size+bb.size))*80)}
export type Match={productId:number;sku:string;name:string;confidence:number;method:string};
export async function matchProduct(client:PoolClient, reference:string, customerId?:number):Promise<Match[]> {
  const raw=String(reference||'').trim(), n=normalizeProductReference(raw); if(!n)return [];
  const r=await client.query(`SELECT p.id,p.sku,COALESCE(p.product_name_en,p.name) name, p.description,
    CASE WHEN lower(p.sku)=lower($1) THEN 100 WHEN regexp_replace(lower(p.sku),'[^a-z0-9]','','g')=$2 THEN 98 ELSE 0 END score,
    'sku' method FROM products p WHERE p.deleted_at IS NULL
    UNION ALL SELECT p.id,p.sku,COALESCE(p.product_name_en,p.name),p.description,96,'alias'
      FROM product_aliases a JOIN products p ON p.id=a.product_id WHERE p.deleted_at IS NULL AND regexp_replace(lower(a.alias),'[^a-z0-9]','','g')=$2
    UNION ALL SELECT p.id,p.sku,COALESCE(p.product_name_en,p.name),p.description,94,'customer_sku'
      FROM customer_products cp JOIN products p ON p.sku=cp.supplier_sku OR p.id IN (SELECT id FROM products WHERE lower(sku)=lower(cp.supplier_sku))
      WHERE cp.customer_id=$3 AND regexp_replace(lower(cp.customer_sku),'[^a-z0-9]','','g')=$2 AND p.deleted_at IS NULL
    UNION ALL SELECT p.id,p.sku,COALESCE(p.product_name_en,p.name),p.description,0,'name'
      FROM products p WHERE p.deleted_at IS NULL AND (p.name ILIKE $4 OR COALESCE(p.product_name_en,'') ILIKE $4 OR COALESCE(p.product_name_tr,'') ILIKE $4)
    LIMIT 50`,[raw,n,customerId||0,`%${raw}%`]);
  const out:Match[]=[]; const seen=new Set<number>();
  for(const x of r.rows){if(seen.has(x.id))continue;seen.add(x.id);let confidence=Number(x.score);if(!confidence)confidence=similarity(n,normalizeProductReference(x.name));out.push({productId:x.id,sku:x.sku,name:x.name,confidence,method:x.method})}
  return out.sort((a,b)=>b.confidence-a.confidence).slice(0,10);
}
export function classifyConfidence(score:number){return score>=95?'HIGH':score>=75?'MEDIUM':'LOW'}
