import {NextRequest,NextResponse} from 'next/server';import {getSession,handleApiError} from '@/lib/api/guards';
export async function GET(req:NextRequest){try{const u=await getSession(req);return NextResponse.json({success:true,data:u})}catch(e){return handleApiError(e)}}
