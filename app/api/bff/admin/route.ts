import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/auth-guard'

export const dynamic = 'force-dynamic';

const UPSTREAM = process.env.ADMIN_SERVICE_URL!

export async function GET(_req: NextRequest) {
  const { accessToken } = await requireRoles(['admin'])
  const res = await fetch(new URL('/admin', UPSTREAM), { headers: { Authorization: `Bearer ${accessToken}` } })
  return NextResponse.json(await res.json(), { status: res.status })
}
