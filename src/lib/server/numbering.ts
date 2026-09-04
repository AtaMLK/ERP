import { PoolClient } from 'pg';

export async function nextNumber(client: PoolClient, sequence: string, prefix: string): Promise<string> {
  const allowed: Record<string, string> = {
    order_number_seq: 'order_number_seq',
    offer_number_seq: 'offer_number_seq',
    invoice_number_seq: 'invoice_number_seq',
    shipment_number_seq: 'shipment_number_seq',
    inquiry_number_seq: 'inquiry_number_seq',
  };
  const seq = allowed[sequence];
  if (!seq) throw new Error('Invalid numbering sequence');
  const result = await client.query(`SELECT nextval('${seq}') AS n`);
  const n = Number(result.rows[0].n);
  return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
}
