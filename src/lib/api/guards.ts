import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { pool } from '@/lib/db';
export class APIError extends Error { constructor(public status:number,message:string){super(message);} }
export type SessionUser={id:number;email:string;name:string;role:string;permissions:string[]};
export async function getSession(req:NextRequest):Promise<SessionUser>{
 const token=req.cookies.get('fz_session')?.value;
 if(!token) throw new APIError(401,'Authentication required');
 const secret=process.env.JWT_SECRET; if(!secret) throw new APIError(500,'JWT_SECRET is not configured');
 let p:any; try{p=jwt.verify(token,secret);}catch(e){throw new APIError(401,'Invalid or expired session');}
 const r=await pool.query(`SELECT u.id,u.email,u.name,COALESCE(r.name,'Viewer') role,COALESCE(array_agg(DISTINCT rp.resource||':'||rp.action) FILTER(WHERE rp.resource IS NOT NULL),'{}') permissions FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id WHERE u.id=$1 AND u.deleted_at IS NULL GROUP BY u.id,u.email,u.name,r.name`,[p.userId]);
 if(!r.rows[0]) throw new APIError(401,'User not found'); return r.rows[0];
}
export function requirePermission(user:SessionUser,permission:string){ if(user.role==='Admin'||user.permissions.includes(permission)) return; throw new APIError(403,'Permission denied'); }
export function handleApiError(e:unknown){ if(e instanceof APIError)return Response.json({success:false,error:e.message},{status:e.status}); console.error(e); return Response.json({success:false,error:'Internal server error'},{status:500}); }
