import {NextRequest} from 'next/server';import {pool} from '@/lib/db';import {getSession,handleApiError} from '@/lib/api/guards';
export async function GET(req:NextRequest){try{await getSession(req);const r=await pool.query('SELECT * FROM exchange_rates ORDER BY rate_date DESC LIMIT 100');return Response.json({success:true,data:r.rows})}catch(e){return handleApiError(e)}}
