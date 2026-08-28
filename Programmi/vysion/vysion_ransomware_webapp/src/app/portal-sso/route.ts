import { db } from "$lib/server/db";
import { UserRole } from "@prisma/client";
import { hash } from "bcrypt";
import { randomBytes } from "crypto";
import http from "http";
import https from "https";
import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";

const CONSUME_URL = process.env.PORTAL_SSO_CONSUME_URL ?? "https://192.168.4.80:5200/api/auth/sso/consume";
const PUBLIC_ORIGIN = (process.env.NEXTAUTH_URL ?? "http://192.168.4.80:3002").replace(/\/$/, "");

type JsonObject = Record<string, unknown>;

function asString(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return "";
}

function parseJsonObject(data: string): JsonObject | null {
    try {
        const parsed: unknown = JSON.parse(data);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as JsonObject;
        }
        return null;
    } catch {
        return null;
    }
}

function postJson(url: string, payload: unknown): Promise<{ status?: number; body: JsonObject | null }> {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "https:" ? https : http;
        const req = lib.request(
            {
                hostname: u.hostname,
                port: u.port || (u.protocol === "https:" ? 443 : 80),
                path: `${u.pathname}${u.search}`,
                method: "POST",
                rejectUnauthorized: false,
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(body),
                },
            },
            (res) => {
                let data = "";
                res.on("data", (c: Buffer) => {
                    data += c.toString();
                });
                res.on("end", () => {
                    resolve({ status: res.statusCode, body: parseJsonObject(data) });
                });
            },
        );
        req.on("error", reject);
        req.setTimeout(8000, () => req.destroy(new Error("timeout")));
        req.write(body);
        req.end();
    });
}

function loginRedirect(callbackUrl: string) {
    const loginUrl = new URL("/login", PUBLIC_ORIGIN);
    loginUrl.searchParams.set("callbackUrl", callbackUrl === "" ? "/dashboard" : callbackUrl);
    return NextResponse.redirect(loginUrl);
}

function portalRole(role: unknown): UserRole {
    if (role === "superadmin" || role === "admin") return UserRole.admin;
    return UserRole.user;
}

async function findOrCreateUser(portal: JsonObject) {
    const email = asString(portal.email).trim().toLowerCase();
    if (!email || email.endsWith("@strumento.local")) return null;

    const existing = await db.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
    });
    if (existing) return existing;

    const idStr = asString(portal.id);
    const portalId = idStr === "" ? randomBytes(4).toString("hex") : idStr;
    let name = `portale-${portalId}`.slice(0, 40);
    const taken = await db.user.findUnique({ where: { name } });
    if (taken) name = `portale-${portalId}-${randomBytes(3).toString("hex")}`.slice(0, 40);

    const password = await hash(randomBytes(32).toString("hex"), 10);
    return db.user.create({
        data: {
            email,
            name,
            password,
            role: portalRole(portal.role),
            provider: "postgres",
        },
    });
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const ticket = (url.searchParams.get("ticket") ?? "").trim();
    const callbackUrl = url.searchParams.get("callbackUrl") ?? `${PUBLIC_ORIGIN}/dashboard`;

    if (!ticket) return loginRedirect(callbackUrl);

    let portal;
    try {
        portal = await postJson(CONSUME_URL, { ticket, tool: "vysion" });
    } catch (err) {
        console.error("[portal-sso] consume failed:", err instanceof Error ? err.message : err);
        return loginRedirect(callbackUrl);
    }
    if (portal.status !== 200 || !portal.body?.email) {
        console.error("[portal-sso] ticket rejected:", portal.status);
        return loginRedirect(callbackUrl);
    }

    let user;
    try {
        user = await findOrCreateUser(portal.body);
    } catch (err) {
        console.error("[portal-sso] user lookup failed:", err instanceof Error ? err.message : err);
        return loginRedirect(callbackUrl);
    }
    if (!user) return loginRedirect(callbackUrl);

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
        console.error("[portal-sso] missing NEXTAUTH_SECRET");
        return loginRedirect(callbackUrl);
    }

    const maxAge = 14 * 24 * 60 * 60;
    const token = await encode({
        token: {
            sub: String(user.id),
            id: String(user.id),
            email: user.email,
            name: user.name,
            role: user.role,
            provider: "Postgres",
        },
        secret,
        maxAge,
    });

    const dest = callbackUrl.startsWith("http")
        ? callbackUrl
        : new URL(callbackUrl, PUBLIC_ORIGIN).toString();
    const res = NextResponse.redirect(dest);
    const cookie = {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        maxAge,
        secure: dest.startsWith("https:"),
    };
    res.cookies.set("next-auth.session-token", token, cookie);
    res.cookies.set("authjs.session-token", token, cookie);
    return res;
}
