import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { requireRoles } from "@/lib/auth-guard";
import {
  getUser,
  updateUser,
  deleteUser,
  resetUserPassword,
} from "@/lib/keycloak-admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await requireRoles(["admin"]);
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  try {
    const user = await getUser(id);
    return NextResponse.json(user);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  await requireRoles(["admin"]);
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, firstName, lastName, enabled, emailVerified, password } =
    body as Record<string, unknown>;

  try {
    await updateUser(id, {
      ...(email !== undefined && { email: email as string }),
      ...(firstName !== undefined && { firstName: firstName as string }),
      ...(lastName !== undefined && { lastName: lastName as string }),
      ...(enabled !== undefined && { enabled: enabled as boolean }),
      ...(emailVerified !== undefined && {
        emailVerified: emailVerified as boolean,
      }),
    });

    if (typeof password === "string" && password) {
      await resetUserPassword(id, password, false);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await requireRoles(["admin"]);
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  try {
    await deleteUser(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
