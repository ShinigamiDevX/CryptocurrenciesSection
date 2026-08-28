/**
 * Copia questa cartella in Chainholder come:
 *   app/portal-sso/route.js
 *
 * Poi imposta in .env di Chainholder:
 *   PORTAL_SSO_CONSUME_URL=https://192.168.4.80:5200/api/auth/sso/consume
 *   NEXTAUTH_URL=http://192.168.1.73:3000
 *
 * Accesso diretto a /login resta email + password + OTP.
 * Dal portale si arriva qui con ?ticket=... e si crea la sessione NextAuth.
 */
import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import https from 'https';
import http from 'http';

const CONSUME_URL = process.env.PORTAL_SSO_CONSUME_URL
    || 'https://192.168.4.80:5200/api/auth/sso/consume';
const PUBLIC_ORIGIN = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || process.env.CHAINHOLDER_PUBLIC_URL || '')
    .replace(/\/$/, '');

function postJson(url, payload) {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            rejectUnauthorized: false,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: null }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => req.destroy(new Error('timeout')));
        req.write(body);
        req.end();
    });
}

export async function GET(req) {
    const url = new URL(req.url);
    const ticket = String(url.searchParams.get('ticket') || '').trim();
    const callbackUrl = url.searchParams.get('callbackUrl') || '/dashboard/requests';
    const origin = PUBLIC_ORIGIN || url.origin;
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('callbackUrl', callbackUrl);

    if (!ticket) {
        return NextResponse.redirect(loginUrl);
    }

    let portal;
    try {
        portal = await postJson(CONSUME_URL, { ticket, tool: 'chainholder' });
    } catch {
        return NextResponse.redirect(loginUrl);
    }
    if (!portal || portal.status !== 200 || !portal.body || !portal.body.email) {
        return NextResponse.redirect(loginUrl);
    }

    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!secret) {
        return NextResponse.redirect(loginUrl);
    }

    const maxAge = 12 * 60 * 60;
    const token = await encode({
        token: {
            sub: String(portal.body.id || portal.body.email),
            email: portal.body.email,
            name: portal.body.displayName || portal.body.email,
            role: portal.body.role,
        },
        secret,
        maxAge,
    });

    const dest = callbackUrl.startsWith('http')
        ? callbackUrl
        : new URL(callbackUrl, origin).toString();
    const res = NextResponse.redirect(dest);
    const secure = url.protocol === 'https:';
    const cookie = {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge,
        secure,
    };
    res.cookies.set('next-auth.session-token', token, cookie);
    res.cookies.set('authjs.session-token', token, cookie);
    if (secure) {
        res.cookies.set('__Secure-next-auth.session-token', token, cookie);
        res.cookies.set('__Secure-authjs.session-token', token, cookie);
    }
    return res;
}
