import { PoolClient } from 'pg';

export async function audit(client: PoolClient, userId: number, action: string, resource: string, resourceId: number | null, changes?: unknown) {
  await client.query(
    `INSERT INTO audit_logs(user_id,action,resource,resource_id,changes) VALUES($1,$2,$3,$4,$5)`,
    [userId, action, resource, resourceId, changes ? JSON.stringify(changes) : null]
  );
}
