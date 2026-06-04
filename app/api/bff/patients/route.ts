import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/auth-guard'

export const dynamic = 'force-dynamic';

const UPSTREAM = process.env.PATIENT_SERVICE_URL!
const ALLOWED_QUERY_PARAMS = ['page', 'limit', 'search', 'sort']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const { accessToken } = await requireRoles(['admin', 'doctor', 'nurse', 'viewer'])
  const upstream = new URL('/patients', UPSTREAM)
  const filtered = new URLSearchParams()
  for (const k of ALLOWED_QUERY_PARAMS) {
    const v = req.nextUrl.searchParams.get(k)
    if (v) filtered.set(k, v)
  }
  upstream.search = filtered.toString()
  const res = await fetch(upstream, { headers: { Authorization: `Bearer ${accessToken}` } })
  return NextResponse.json(await res.json(), { status: res.status })
}

export async function POST(req: NextRequest) {
  const { accessToken } = await requireRoles(['admin', 'doctor'])
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
  }
  const res = await fetch(new URL('/patients', UPSTREAM), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return NextResponse.json(await res.json(), { status: res.status })
}

export async function DELETE(req: NextRequest) {
  const { accessToken } = await requireRoles(['admin'])
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid or missing patient id' }, { status: 400 })
  }
  const res = await fetch(new URL(`/patients/${id}`, UPSTREAM), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return NextResponse.json(await res.json(), { status: res.status })
}
