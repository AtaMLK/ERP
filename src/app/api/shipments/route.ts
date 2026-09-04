import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { audit } from '@/lib/server/audit';
import { nextNumber } from '@/lib/server/numbering';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req); requirePermission(user, 'shipments:read');
    const r = await pool.query(`SELECT s.*,o.order_number,c.name customer_name,COALESCE((SELECT SUM(si.quantity) FROM shipment_items si WHERE si.shipment_id=s.id),0) shipment_quantity FROM shipments s JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 200`);
    return Response.json({success:true,data:r.rows});
  } catch(e){return handleApiError(e)}
}

export async function POST(req: NextRequest) {
  const client=await pool.connect();
  try {
    const user=await getSession(req); requirePermission(user,'shipments:create');
    const body=await req.json();
    if(!Number.isInteger(body.orderId)||!Array.isArray(body.items)||!body.items.length) throw new Error('orderId and shipment items are required');
    await client.query('BEGIN');
    const order=await client.query(`SELECT * FROM orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[body.orderId]);
    if(!order.rows[0]) throw new Error('Order not found');
    if(!['in_production','shipped'].includes(order.rows[0].status)) throw new Error('Order is not ready for shipment');
    const shipmentNumber=await nextNumber(client,'shipment_number_seq','SHP');
    const shipment=await client.query(`INSERT INTO shipments(shipment_number,order_id,status,shipment_date,expected_delivery,carrier,tracking_number,incoterm_code) VALUES($1,$2,'READY',$3,$4,$5,$6,$7) RETURNING *`,[shipmentNumber,body.orderId,body.shipmentDate||new Date().toISOString(),body.expectedDelivery||null,body.carrier||null,body.trackingNumber||null,body.incotermCode||null]);
    const items=[];
    for(const item of body.items){
      const oi=await client.query(`SELECT oi.id,oi.quantity,COALESCE((SELECT SUM(si.quantity) FROM shipment_items si JOIN shipments sx ON sx.id=si.shipment_id WHERE si.order_item_id=oi.id AND sx.deleted_at IS NULL),0) shipped_before FROM order_items oi WHERE oi.id=$1 AND oi.order_id=$2`,[item.orderItemId,body.orderId]);
      if(!oi.rows[0]) throw new Error(`Order item ${item.orderItemId} not found`);
      const qty=Number(item.quantity); if(!Number.isFinite(qty)||qty<=0) throw new Error(`Invalid shipment quantity for order item ${item.orderItemId}`);
      const ordered=Number(oi.rows[0].quantity), shippedBefore=Number(oi.rows[0].shipped_before), cumulative=shippedBefore+qty;
      await client.query('INSERT INTO shipment_items(shipment_id,order_item_id,quantity) VALUES($1,$2,$3)',[shipment.rows[0].id,item.orderItemId,qty]);
      items.push({orderItemId:Number(item.orderItemId),shipmentQuantity:qty,orderedQuantity:ordered,cumulativeQuantity:cumulative,variance:cumulative-ordered,overShipped:cumulative>ordered});
    }
    if(body.packingList) await client.query(`INSERT INTO packing_lists(shipment_id,gross_weight,net_weight,pallet_count,package_count,notes) VALUES($1,$2,$3,$4,$5,$6)`,[shipment.rows[0].id,body.packingList.grossWeight||null,body.packingList.netWeight||null,body.packingList.palletCount||null,body.packingList.packageCount||null,body.packingList.notes||null]);
    if(body.loadingInstruction) await client.query('INSERT INTO loading_instructions(shipment_id,instruction_text) VALUES($1,$2)',[shipment.rows[0].id,body.loadingInstruction]);
    const fulfillment=await client.query(`SELECT oi.id,oi.quantity,COALESCE((SELECT SUM(si.quantity) FROM shipment_items si JOIN shipments sx ON sx.id=si.shipment_id WHERE si.order_item_id=oi.id AND sx.deleted_at IS NULL),0) shipped_quantity FROM order_items oi WHERE oi.order_id=$1`,[body.orderId]);
    const fullyFulfilled=fulfillment.rows.length>0&&fulfillment.rows.every((x:any)=>Number(x.shipped_quantity)>=Number(x.quantity));
    const previousStatus=order.rows[0].status,nextStatus=fullyFulfilled?'shipped':'in_production';
    if(previousStatus!==nextStatus){await client.query('UPDATE orders SET status=$1,updated_at=now() WHERE id=$2',[nextStatus,body.orderId]);await client.query('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by) VALUES($1,$2,$3,$4)',[body.orderId,previousStatus,nextStatus,user.id]);}
    await audit(client,user.id,'create','shipments',shipment.rows[0].id,{shipment_number:shipmentNumber,order_id:body.orderId,items,fully_fulfilled:fullyFulfilled});
    await client.query('COMMIT');
    return Response.json({success:true,data:{...shipment.rows[0],fullyFulfilled,items}},{status:201});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return handleApiError(e)}finally{client.release()}
}
