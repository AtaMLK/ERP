-- Document export/email permissions for ERP-generated customer and shipment documents.
INSERT INTO permissions(resource, action) VALUES
  ('documents','read'),
  ('documents','export'),
  ('email','send')
ON CONFLICT(resource, action) DO NOTHING;

INSERT INTO role_permissions(role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('Admin','Sales','Accountant','Export')
  AND ((p.resource='documents' AND p.action IN ('read','export')) OR (p.resource='email' AND p.action='send'))
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
