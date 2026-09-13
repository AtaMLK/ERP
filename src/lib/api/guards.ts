import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { pool } from '@/lib/db';

export class APIError extends Error { constructor(public status:number,message:string){super(message);} }
export type SessionUser={id:number;email:string;name:string;role:string;permissions:string[];deniedPermissions:string[]};

export async function getSession(req:NextRequest):Promise<SessionUser>{
 const token=req.cookies.get('fz_session')?.value;if(!token)throw new APIError(401,'Authentication required');
 const secret=process.env.JWT_SECRET;if(!secret||secret.length<32)throw new APIError(500,'JWT_SECRET is not configured securely');
 let p:any;try{p=jwt.verify(token,secret,{algorithms:['HS256'],issuer:'fz-erp',maxAge:'8h'});}catch{throw new APIError(401,'Invalid or expired session');}
 if(!p||typeof p.userId!=='number')throw new APIError(401,'Invalid session');
 const r=await pool.query(`SELECT u.id,u.email,u.name,COALESCE(r.name,'Viewer') role,
 COALESCE(array_agg(DISTINCT rp.resource||':'||rp.action) FILTER(WHERE rp.resource IS NOT NULL),'{}') permissions,
 COALESCE((SELECT array_agg(upo.resource||':'||upo.action) FROM user_permission_overrides upo WHERE upo.user_id=u.id AND upo.allowed=false),'{}') denied_permissions
 FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id
 WHERE u.id=$1 AND u.deleted_at IS NULL GROUP BY u.id,u.email,u.name,r.name`,[p.userId]);
 if(!r.rows[0])throw new APIError(401,'User not found');
 return {...r.rows[0],deniedPermissions:r.rows[0].denied_permissions||[]};
}
export function requirePermission(user:SessionUser,permission:string){if(user.role==='Admin')return;if(user.deniedPermissions.includes(permission))throw new APIError(403,'Permission denied');if(user.permissions.includes(permission))return;throw new APIError(403,'Permission denied');}
export function handleApiError(e:unknown){if(e instanceof APIError)return Response.json({success:false,error:e.message},{status:e.status});console.error(e);return Response.json({success:false,error:e instanceof Error?e.message:'Internal server error'},{status:500});}
