import { connection, NextResponse } from "next/server";
import { config, readSession } from "@/lib/server/google";

export async function GET() {
  await connection(); // answer per request: it depends on the visitor's cookie and the server's settings
  const { configured } = config();
  const s = await readSession();
  return NextResponse.json(
    { googleConfigured: configured, user: s ? { sub: s.sub, email: s.email, name: s.name, picture: s.picture } : null },
    { headers: { "cache-control": "no-store" } },
  );
}
