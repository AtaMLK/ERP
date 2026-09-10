import {NextRequest} from 'next/server';
import {pool} from '@/lib/db';
import {getSession,requirePermission,handleApiError} from '@/lib/api/guards';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const u=await getSession(req);requirePermission(u,'admin:users');const r=await pool.query(`SELECT u.id,u.email,u.name,u.deleted_at,COALESCE(r.name,'') role,COALESCE((SELECT json_agg(json_build_object('resource',x.resource,'action',x.action,'allowed',x.allowed)) FROM user_permission_overrides x WHERE x.user_id=u.id),'[]') overrides FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id ORDER BY u.deleted_at NULLS FIRST,u.name`);return Response.json({success:true,data:r.rows})}catch(e){return handleApiError(e)}}
