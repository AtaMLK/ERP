-- Shipment quantities are cumulative across shipment records.
-- A shipment may contain fewer, equal, or more units than the original order quantity.
-- Do not add a uniqueness constraint on (shipment_id, order_item_id): the same order item may be split across shipments.

CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item ON shipment_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order_status ON shipments(order_id,status);
