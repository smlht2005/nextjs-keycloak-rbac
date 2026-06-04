import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { requireRoles } from "@/lib/auth-guard";
import { listUsers, createUser } from "@/lib/keycloak-admin";

const USERNAME_RE = /^[a-zA-Z0-9._@-]{3,64}$/;

export async function GET(req: NextRequest) {
  await requireRoles(["admin"]);
  const search = req.nextUrl.searchParams.get("search") ?? undefined;
  try {
    const users = await listUsers(search);
    return NextResponse.json(users);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  await requireRoles(["admin"]);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { username, email, firstName, lastName, enabled, password } =
    body as Record<string, string>;

  if (!username || !USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "username is required (3–64 chars, alphanumeric/._@-)" },
      { status: 400 },
    );
  }

  try {
    const id = await createUser({
      username,
      email: email || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      enabled: enabled === 'false' ? false : true,
      emailVerified: false,
      ...(password
        ? {
            credentials: [
              { type: "password", value: password, temporary: true },
            ],
          }
        : {}),
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg.includes("409") ? 409 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
