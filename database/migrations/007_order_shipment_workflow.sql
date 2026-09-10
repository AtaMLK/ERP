INSERT INTO permissions(resource, action) VALUES
  ('orders','approve'),
  ('orders','cancel'),
  ('shipments','approve')
ON CONFLICT(resource, action) DO NOTHING;

INSERT INTO role_permissions(role_id, resource, action)
SELECT r.id,p.resource,p.action
FROM roles r CROSS JOIN permissions p
WHERE r.name='Admin'
  AND ((p.resource='orders' AND p.action IN ('approve','cancel')) OR (p.resource='shipments' AND p.action='approve'))
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, resource, action)
SELECT r.id,p.resource,p.action
FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('Sales','Purchase','Export')
  AND p.resource='orders' AND p.action IN ('approve','cancel')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, resource, action)
SELECT r.id,p.resource,p.action
FROM roles r CROSS JOIN permissions p
WHERE r.name='Export' AND p.resource='shipments' AND p.action='approve'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item ON shipment_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order_active ON shipments(order_id) WHERE deleted_at IS NULL;
