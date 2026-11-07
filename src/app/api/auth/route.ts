import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { authenticate, createSession, destroySession, register } from "@/lib/auth";
import { checkOrigin, error, respondError, readBody, rateLimit } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readBody(request);
    if (body.action === "logout") {
      await destroySession();
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "login" && body.action !== "register") return error("Aksi tidak dikenal.");
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[a-z0-9_]{3,30}$/.test(username) || password.length < 1 || password.length > 200) return error("Username atau kata sandi tidak valid.");
    const trustedHeader = process.env.AUTH_CLIENT_IP_HEADER;
    if (trustedHeader) {
      // Only enable behind a proxy that overwrites this header and is the sole ingress.
      const ip = request.headers.get(trustedHeader)?.trim();
      if (!ip || !isIP(ip)) return error("Identitas klien dari proxy tidak tersedia.", 503);
      rateLimit(`auth:${body.action}:${ip}`, body.action === "login" ? 60 : 12, 15 * 60_000);
    } else {
      rateLimit("auth:global", 120, 60_000);
    }
    if (body.action === "register") {
      if (!/^[a-z0-9_]{3,30}$/.test(username) || password.length < 10 || password.length > 200) {
        return error("Username 3–30 karakter (huruf, angka, _) dan kata sandi minimal 10 karakter.");
      }
      let user;
      try { user = register(username, password); }
      catch (cause) {
        if (cause instanceof Error && cause.message.includes("UNIQUE")) return error("Username sudah dipakai.", 409);
        throw cause;
      }
      await createSession(user.id);
      return NextResponse.json({ user }, { status: 201 });
    }
    const user = authenticate(username, password);
    if (!user) return error("Username atau kata sandi salah.", 401);
    await createSession(user.id);
    return NextResponse.json({ user });
  } catch (cause) { return respondError(cause); }
}
