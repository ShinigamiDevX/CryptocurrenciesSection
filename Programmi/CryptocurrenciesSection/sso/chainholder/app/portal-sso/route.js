/**
 * Copia questo file in Chainholder come:
 *   app/portal-sso/route.js
 *
 * .env di Chainholder:
 *   PORTAL_SSO_CONSUME_URL=https://cryptosection.chainholder.dev/api/auth/sso/consume
 *   NEXTAUTH_URL=http://192.168.1.73:3000
 *
 * Flusso: ticket del portale → email → riscontro nel DB utenti di Chainholder.
 * Se l'email non c'è, si va al login (password + OTP) come sempre.
 * Accesso diretto a /login resta invariato.
 */
import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';

const CONSUME_URL = process.env.PORTAL_SSO_CONSUME_URL
    || 'https://cryptosection.chainholder.dev/api/auth/sso/consume';
const PUBLIC_ORIGIN = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || process.env.CHAINHOLDER_PUBLIC_URL || 'http://192.168.1.73:3000')
    .replace(/\/$/, '');

const globalForPrisma = globalThis;
const prisma = globalForPrisma.__portalSsoPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.__portalSsoPrisma = prisma;

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

function loginRedirect(callbackUrl) {
    const loginUrl = new URL('/login', PUBLIC_ORIGIN);
    loginUrl.searchParams.set('callbackUrl', callbackUrl || '/dashboard/requests');
    return NextResponse.redirect(loginUrl);
}

async function findChainholderUser(email) {
    const raw = String(email || '').trim();
    const lower = raw.toLowerCase();
    if (!raw) return null;

    const tries = [
        () => prisma.user.findFirst({ where: { email: { equals: raw, mode: 'insensitive' } } }),
        () => prisma.user.findUnique({ where: { email: lower } }),
        () => prisma.user.findUnique({ where: { email: raw } }),
        () => prisma.user.findFirst({ where: { email: lower } }),
        () => prisma.user.findFirst({ where: { email: raw } }),
    ];
    for (const fn of tries) {
        try {
            const user = await fn();
            if (user && user.id) return user;
        } catch {
            /* schema diverso: prova la query successiva */
        }
    }

    const rawQueries = [
        ['SELECT * FROM "User" WHERE lower(email) = lower($1) LIMIT 1', [raw]],
        ['SELECT * FROM "users" WHERE lower(email) = lower($1) LIMIT 1', [raw]],
        ['SELECT * FROM User WHERE lower(email) = lower(?) LIMIT 1', [raw]],
        ['SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1', [raw]],
    ];
    for (const [sql, params] of rawQueries) {
        try {
            const rows = await prisma.$queryRawUnsafe(sql, ...params);
            const user = Array.isArray(rows) ? rows[0] : rows;
            if (user && (user.id || user.Id)) return user;
        } catch {
            /* tabella assente */
        }
    }
    return null;
}

export async function GET(req) {
    const url = new URL(req.url);
    const ticket = String(url.searchParams.get('ticket') || '').trim();
    const callbackUrl = url.searchParams.get('callbackUrl') || `${PUBLIC_ORIGIN}/dashboard/requests`;

    if (!ticket) {
        return loginRedirect(callbackUrl);
    }

    let portal;
    try {
        portal = await postJson(CONSUME_URL, { ticket, tool: 'chainholder' });
    } catch (err) {
        console.error('[portal-sso] consume failed:', err && err.message);
        return loginRedirect(callbackUrl);
    }
    if (!portal || portal.status !== 200 || !portal.body || !portal.body.email) {
        console.error('[portal-sso] ticket rejected:', portal && portal.status);
        return loginRedirect(callbackUrl);
    }

    const email = String(portal.body.email).trim();
    let user;
    try {
        user = await findChainholderUser(email);
    } catch (err) {
        console.error('[portal-sso] db lookup failed:', err && err.message);
        return loginRedirect(callbackUrl);
    }
    if (!user) {
        console.warn('[portal-sso] email not in Chainholder DB:', email);
        return loginRedirect(callbackUrl);
    }

    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!secret) {
        console.error('[portal-sso] missing NEXTAUTH_SECRET');
        return loginRedirect(callbackUrl);
    }

    const userId = String(user.id || user.Id);
    const userEmail = String(user.email || email);
    const userName = user.name || user.nome || user.displayName || portal.body.displayName || userEmail;
    const userRole = user.role || user.Role || portal.body.role;

    const maxAge = 12 * 60 * 60;
    const token = await encode({
        token: {
            sub: userId,
            id: userId,
            email: userEmail,
            name: userName,
            role: userRole,
            picture: user.image || user.imageUrl || null,
        },
        secret,
        maxAge,
    });

    const dest = callbackUrl.startsWith('http')
        ? callbackUrl
        : new URL(callbackUrl, PUBLIC_ORIGIN).toString();
    const res = NextResponse.redirect(dest);
    const cookie = {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge,
        secure: dest.startsWith('https:'),
    };
    res.cookies.set('next-auth.session-token', token, cookie);
    res.cookies.set('authjs.session-token', token, cookie);
    return res;
}
