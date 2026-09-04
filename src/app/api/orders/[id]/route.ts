import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { audit } from '@/lib/server/audit';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

const allowed: Record<string,string[]> = {
  draft:['supplier_ordered','canceled'],
  supplier_ordered:['proforma_sent','canceled'],
  proforma_sent:['customer_confirmed','canceled'],
  customer_confirmed:['in_production','canceled'],
  in_production:['shipped','canceled'],
  shipped:['completed'],
  completed:[],
  canceled:[]
};

export async function GET(req: NextRequest,{params}:{params:{id:string}}){
  try {
    const user=await getSession(req);
    requirePermission(user,'orders:read');

    const orderResult=await pool.query(`
      SELECT o.*,c.name AS customer_name,c.email AS customer_email,
             ci.inquiry_number,po.offer_number
      FROM orders o
      JOIN customers c ON c.id=o.customer_id
      LEFT JOIN customer_inquiries ci ON ci.id=o.inquiry_id
      LEFT JOIN price_offers po ON po.id=ci.offer_id
      WHERE o.id=$1 AND o.deleted_at IS NULL
    `,[params.id]);
    if(!orderResult.rows[0]) return Response.json({success:false,error:'Order not found'},{status:404});

    const itemsResult=await pool.query(`
      SELECT oi.id,oi.product_id AS "productId",p.name AS "productName",p.sku,
             oi.quantity,oi.unit_purchase_price AS "unitPurchasePrice",
             oi.unit_sale_price AS "unitSalePrice",oi.total_sale_price AS "totalSalePrice",
             oi.currency,oi.options_snapshot AS options,
             COALESCE(SUM(CASE WHEN s.deleted_at IS NULL THEN si.quantity ELSE 0 END),0) AS "shippedQuantity"
      FROM order_items oi
      LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN shipment_items si ON si.order_item_id=oi.id
      LEFT JOIN shipments s ON s.id=si.shipment_id
      WHERE oi.order_id=$1
      GROUP BY oi.id,p.name,p.sku
      ORDER BY oi.id
    `,[params.id]);

    const shipmentHistory=await pool.query(`
      SELECT s.id,s.shipment_number,s.status,s.shipment_date,s.expected_delivery,s.carrier,s.tracking_number,
             si.order_item_id,si.quantity
      FROM shipments s
      JOIN shipment_items si ON si.shipment_id=s.id
      WHERE s.order_id=$1 AND s.deleted_at IS NULL
      ORDER BY COALESCE(s.shipment_date,s.created_at) DESC,s.id DESC
    `,[params.id]);

    const statusHistory=await pool.query(`
      SELECT h.id,h.from_status,h.to_status,h.created_at,u.name AS changed_by_name
      FROM order_status_history h
      LEFT JOIN users u ON u.id=h.changed_by
      WHERE h.order_id=$1 ORDER BY h.created_at ASC,h.id ASC
    `,[params.id]);

    const invoiceResult=await pool.query(`
      SELECT i.id,i.invoice_number,i.status,i.total_amount,i.currency,i.due_date,
             COALESCE(SUM(CASE WHEN p.status IS NULL OR UPPER(p.status) <> 'CANCELED' THEN p.amount ELSE 0 END),0) AS paid_amount
      FROM invoices i
      LEFT JOIN payments p ON p.invoice_id=i.id
      WHERE i.order_id=$1 AND i.deleted_at IS NULL
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `,[params.id]);

    const items=itemsResult.rows.map((item)=>{
      const ordered=Number(item.quantity || 0);
      const shipped=Number(item.shippedQuantity || 0);
      const remaining=Math.max(ordered-shipped,0);
      const variance=shipped-ordered;
      return {
        ...item,
        quantity:ordered,
        shippedQuantity:shipped,
        remainingQuantity:remaining,
        varianceQuantity:variance,
        fulfillmentStatus: shipped===0 ? 'not_shipped' : shipped<ordered ? 'partial' : shipped===ordered ? 'fulfilled' : 'over_shipped',
        shipments: shipmentHistory.rows.filter((row)=>row.order_item_id===item.id)
      };
    });

    const invoices=invoiceResult.rows.map((invoice)=>({
      ...invoice,
      total_amount:Number(invoice.total_amount || 0),
      paid_amount:Number(invoice.paid_amount || 0),
      remaining_amount:Math.max(Number(invoice.total_amount || 0)-Number(invoice.paid_amount || 0),0)
    }));

    return Response.json({
      success:true,
      data:{...orderResult.rows[0],items,statusHistory:statusHistory.rows,invoices}
    });
  } catch(e){ return handleApiError(e); }
}

export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){
  const client=await pool.connect();
  try {
    const user=await getSession(req);
    requirePermission(user,'orders:update');
    const body=await req.json();
    await client.query('BEGIN');
    const current=await client.query('SELECT * FROM orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[params.id]);
    if(!current.rows[0]) {
      await client.query('ROLLBACK');
      return Response.json({success:false,error:'Order not found'},{status:404});
    }
    const o=current.rows[0];

    if(body.status && body.status!==o.status){
      if(!allowed[o.status]?.includes(body.status)) throw new Error(`Invalid status transition: ${o.status} -> ${body.status}`);

      if(body.status==='shipped'){
        const fulfillment=await client.query(`
          SELECT COUNT(*) FILTER (WHERE shipped_qty < quantity)::int AS incomplete_items
          FROM (
            SELECT oi.id,oi.quantity,COALESCE(SUM(CASE WHEN s.deleted_at IS NULL THEN si.quantity ELSE 0 END),0) AS shipped_qty
            FROM order_items oi
            LEFT JOIN shipment_items si ON si.order_item_id=oi.id
            LEFT JOIN shipments s ON s.id=si.shipment_id
            WHERE oi.order_id=$1
            GROUP BY oi.id,oi.quantity
          ) x
        `,[o.id]);
        if(Number(fulfillment.rows[0]?.incomplete_items || 0)>0) throw new Error('Order cannot be marked shipped until every order item is fully fulfilled');
      }

      if(body.status==='completed'){
        const finance=await client.query(`
          SELECT COUNT(*)::int AS invoice_count,
                 COUNT(*) FILTER (WHERE remaining_amount > 0.005)::int AS unpaid_count
          FROM (
            SELECT i.id,GREATEST(i.total_amount-COALESCE(SUM(CASE WHEN p.status IS NULL OR UPPER(p.status) <> 'CANCELED' THEN p.amount ELSE 0 END),0),0) AS remaining_amount
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id=i.id
            WHERE i.order_id=$1 AND i.deleted_at IS NULL
            GROUP BY i.id
          ) x
        `,[o.id]);
        if(Number(finance.rows[0]?.invoice_count || 0)>0 && Number(finance.rows[0]?.unpaid_count || 0)>0) throw new Error('Order cannot be completed while customer invoices have unpaid balances');
      }

      await client.query('UPDATE orders SET status=$1,updated_at=now() WHERE id=$2',[body.status,o.id]);
      await client.query('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by) VALUES($1,$2,$3,$4)',[o.id,o.status,body.status,user.id]);
    }

    const fields:[string,unknown][]=[];
    for(const [column,key] of [['customer_order_number','customerOrderNumber'],['customer_order_date','customerOrderDate'],['requested_delivery_date','requestedDeliveryDate'],['notes','notes']] as const){
      if(key in body) fields.push([column,body[key] ?? null]);
    }
    if(fields.length){
      const set=fields.map(([c],i)=>`${c}=$${i+1}`).join(',');
      await client.query(`UPDATE orders SET ${set},updated_at=now() WHERE id=$${fields.length+1}`,[...fields.map(x=>x[1]),o.id]);
    }

    await audit(client,user.id,'update','orders',o.id,{status:body.status,fields:fields.map(x=>x[0])});
    await client.query('COMMIT');
    const updated=await pool.query('SELECT * FROM orders WHERE id=$1',[o.id]);
    return Response.json({success:true,data:updated.rows[0]});
  } catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    return handleApiError(e);
  } finally { client.release(); }
}

export async function DELETE(req:NextRequest,{params}:{params:{id:string}}){
  const client=await pool.connect();
  try{
    const user=await getSession(req);
    requirePermission(user,'orders:delete');
    await client.query('BEGIN');
    const r=await client.query('UPDATE orders SET deleted_at=now(),updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',[params.id]);
    if(!r.rows[0]){
      await client.query('ROLLBACK');
      return Response.json({success:false,error:'Order not found'},{status:404});
    }
    await audit(client,user.id,'delete','orders',r.rows[0].id);
    await client.query('COMMIT');
    return Response.json({success:true});
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    return handleApiError(e);
  }finally{client.release();}
}
