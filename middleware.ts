import { NextRequest, NextResponse } from 'next/server';

const textEncoder = new TextEncoder();

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function verifyJwt(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  try {
    const header = JSON.parse(decodeBase64Url(encodedHeader));
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return false;
    if (payload.iss !== 'fz-erp') return false;
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return false;

    const key = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    return await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(encodedSignature),
      textEncoder.encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/auth')) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/') || req.nextUrl.pathname !== '/login') {
    const token = req.cookies.get('fz_session')?.value;
    const secret = process.env.JWT_SECRET;

    if (!token || !secret) {
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', req.url));
    }

    if (!(await verifyJwt(token, secret))) {
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
