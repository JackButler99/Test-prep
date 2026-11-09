import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SKD_EXAM_ID } from "@/lib/skd-format";

export const config = {
  matcher: "/manage/packages/:packageId/preview",
  runtime: "nodejs",
};

export async function middleware(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  const match = /^\/manage\/packages\/([a-f\d-]{36})\/preview\/?$/i.exec(request.nextUrl.pathname);
  if (!match || (await getUser())?.role !== "admin") return NextResponse.next();

  const [, id] = match;
  const previewable = db().prepare(`SELECT 1 FROM assessment_packages
    WHERE id=? AND exam_id=? AND state IN ('draft','published')
    AND json_type(snapshot_json, '$.skd')='object'`).get(id, SKD_EXAM_ID);
  if (!previewable) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = `/manage/skd-preview/${id}`;
  return NextResponse.rewrite(target);
}
