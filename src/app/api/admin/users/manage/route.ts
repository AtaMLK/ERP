import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { getSession, requirePermission, handleApiError } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
const Roles = ['Admin','Sales','Purchase','Accountant','Export'] as const;
const createSchema = z.object({ email:z.string().email().max(255), name:z.string().min(2).max(255), password:z.string().min(8).max(200), role:z.enum(Roles) });
const updateSchema = z.object({ userId:z.coerce.number().int().positive(), name:z.string().min(2).max(255).optional(), email:z.string().email().max(255).optional(), password:z.string().min(8).max(200).optional(), role:z.enum(Roles).optional(), active:z.boolean().optional(), overrides:z.array(z.object({resource:z.string().min(1).max(100),action:z.string().min(1).max(50),allowed:z.boolean()})).optional(), reports:z.array(z.object({code:z.string().min(1).max(100),allowed:z.boolean()})).optional() });

async function guard(req:NextRequest){ const me=await getSession(req); requirePermission(me,'admin:users'); return me; }

export async function GET(req:NextRequest){
  try{
    await guard(req);
    const [roles,permissions,reports]=await Promise.all([
      pool.query(`SELECT id,name,description FROM roles WHERE name = ANY($1::text[]) ORDER BY array_position($1::text[],name)`,[[...Roles]]),
      pool.query(`SELECT resource,action FROM permissions ORDER BY resource,action`),
      pool.query(`SELECT code,name,description,category,active FROM report_definitions WHERE active=true ORDER BY category,name`)
    ]);
    return Response.json({success:true,roles:roles.rows,permissions:permissions.rows,reports:reports.rows});
  }catch(e){return handleApiError(e)}
}

export async function POST(req:NextRequest){
  const client=await pool.connect();
  try{
    const me=await guard(req); const parsed=createSchema.safeParse(await req.json());
    if(!parsed.success)return Response.json({success:false,error:'Invalid user data',details:parsed.error.flatten()},{status:400});
    const {email,name,password,role}=parsed.data; await client.query('BEGIN');
    const exists=await client.query(`SELECT 1 FROM users WHERE lower(email)=lower($1)`,[email.trim()]);
    if(exists.rowCount)throw Object.assign(new Error('A user with this email already exists'),{status:409});
    const hash=await bcrypt.hash(password,12);
    const u=await client.query(`INSERT INTO users(email,name,password_hash) VALUES(lower($1),$2,$3) RETURNING id,email,name`,[email.trim(),name.trim(),hash]);
    const r=await client.query(`SELECT id FROM roles WHERE name=$1`,[role]); if(!r.rows[0])throw Object.assign(new Error('Role not found'),{status:400});
    await client.query(`INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)`,[u.rows[0].id,r.rows[0].id]);
    await client.query(`INSERT INTO audit_logs(user_id,action,resource,resource_id,changes) VALUES($1,'create','users',$2,$3)`,[me.id,u.rows[0].id,JSON.stringify({email:u.rows[0].email,name:u.rows[0].name,role})]);
    await client.query('COMMIT'); return Response.json({success:true,data:u.rows[0]},{status:201});
  }catch(e:any){await client.query('ROLLBACK').catch(()=>{});if(e?.code==='P0001'||e?.status)return Response.json({success:false,error:e.message},{status:e?.status||409});return handleApiError(e)}finally{client.release()}
}

export async function PATCH(req:NextRequest){
  const client=await pool.connect();
  try{
    const me=await guard(req); const parsed=updateSchema.safeParse(await req.json());
    if(!parsed.success)return Response.json({success:false,error:'Invalid update data',details:parsed.error.flatten()},{status:400});
    const d=parsed.data; await client.query('BEGIN');
    const current=await client.query(`SELECT u.id,u.email,u.name,u.deleted_at,COALESCE(r.name,'') role FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 FOR UPDATE`,[d.userId]);
    if(!current.rows[0])throw Object.assign(new Error('User not found'),{status:404});
    if(d.userId===me.id && d.active===false)throw Object.assign(new Error('You cannot deactivate your own account'),{status:400});
    if(d.email){const dup=await client.query(`SELECT 1 FROM users WHERE lower(email)=lower($1) AND id<>$2`,[d.email.trim(),d.userId]);if(dup.rowCount)throw Object.assign(new Error('A user with this email already exists'),{status:409})}
    const sets:string[]=[];const vals:any[]=[];const add=(sql:string,v:any)=>{sets.push(sql.replace('?',String(vals.length+1)));vals.push(v)};
    if(d.name!==undefined)add('name=?',d.name.trim()); if(d.email!==undefined)add('email=?',d.email.trim().toLowerCase()); if(d.password!==undefined)add('password_hash=?',await bcrypt.hash(d.password,12)); if(d.active!==undefined)add('deleted_at=?',d.active?null:new Date());
    if(sets.length){vals.push(d.userId);await client.query(`UPDATE users SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length}`,vals)}
    if(d.role){const r=await client.query(`SELECT id FROM roles WHERE name=$1`,[d.role]);if(!r.rows[0])throw Object.assign(new Error('Role not found'),{status:400});await client.query(`DELETE FROM user_roles WHERE user_id=$1`,[d.userId]);await client.query(`INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)`,[d.userId,r.rows[0].id])}
    if(d.overrides){await client.query(`DELETE FROM user_permission_overrides WHERE user_id=$1`,[d.userId]);for(const x of d.overrides)await client.query(`INSERT INTO user_permission_overrides(user_id,resource,action,allowed,created_by) VALUES($1,$2,$3,$4,$5)`,[d.userId,x.resource,x.action,x.allowed,me.id])}
    if(d.reports){await client.query(`DELETE FROM user_report_permissions WHERE user_id=$1`,[d.userId]);for(const x of d.reports)await client.query(`INSERT INTO user_report_permissions(user_id,report_code,allowed) VALUES($1,$2,$3)`,[d.userId,x.code,x.allowed])}
    await client.query(`INSERT INTO audit_logs(user_id,action,resource,resource_id,changes) VALUES($1,'update','users',$2,$3)`,[me.id,d.userId,JSON.stringify({before:current.rows[0],after:d})]);
    await client.query('COMMIT');return Response.json({success:true});
  }catch(e:any){await client.query('ROLLBACK').catch(()=>{});if(e?.code==='P0001'||e?.status)return Response.json({success:false,error:e.message},{status:e?.status||409});return handleApiError(e)}finally{client.release()}
}

export async function DELETE(req:NextRequest){try{const me=await guard(req);const id=Number(new URL(req.url).searchParams.get('id'));if(!Number.isInteger(id)||id<1)return Response.json({success:false,error:'Valid user id is required'},{status:400});if(id===me.id)return Response.json({success:false,error:'You cannot deactivate your own account'},{status:400});await pool.query(`UPDATE users SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`,[id]);await pool.query(`INSERT INTO audit_logs(user_id,action,resource,resource_id,changes) VALUES($1,'deactivate','users',$2,'{}'::jsonb)`,[me.id,id]);return Response.json({success:true})}catch(e){return handleApiError(e)}}
