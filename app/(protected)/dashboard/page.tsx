import { requireAuth } from '@/lib/auth-guard'
import { ROLE_PERMISSIONS } from '@/types/auth'

type PatientResult = { data: unknown[] } | { error: string }

async function fetchPatients(accessToken: string): Promise<PatientResult> {
  try {
    const res = await fetch(`${process.env.PATIENT_SERVICE_URL}/patients`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    if (!res.ok) return { error: `上游服務回應 HTTP ${res.status}` }
    const json = await res.json()
    return { data: Array.isArray(json) ? json : (json.data ?? []) }
  } catch {
    return { error: '病患服務暫不可用（PATIENT_SERVICE_URL 未啟動）' }
  }
}

export default async function DashboardPage() {
  const { username, email, fullName, roles, payload, accessToken } = await requireAuth()
  const permissions = [...new Set(roles.flatMap(r => ROLE_PERMISSIONS[r] ?? []))]
  const tokenExpiry = payload.exp
    ? new Date(payload.exp * 1000).toLocaleString('zh-TW')
    : 'N/A'
  const patients = await fetchPatients(accessToken)

  return (
    <main className="p-8 space-y-8 max-w-4xl">
      {/* ── 使用者資訊 ── */}
      <section className="border rounded-lg p-6 space-y-3">
        <h1 className="text-2xl font-bold">Welcome, {username}</h1>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-gray-500">全名</dt>
          <dd>{fullName || '—'}</dd>
          <dt className="text-gray-500">Email</dt>
          <dd>{email || '—'}</dd>
          <dt className="text-gray-500">角色</dt>
          <dd>{roles.join(', ')}</dd>
          <dt className="text-gray-500">權限</dt>
          <dd className="break-all">{permissions.join(', ')}</dd>
          <dt className="text-gray-500">Token 到期</dt>
          <dd>{tokenExpiry}</dd>
        </dl>
      </section>

      {/* ── 病患列表 ── */}
      <section className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">病患列表</h2>
        {'error' in patients ? (
          <p className="text-amber-600 text-sm">⚠ {patients.error}</p>
        ) : patients.data.length === 0 ? (
          <p className="text-gray-500 text-sm">目前無病患資料</p>
        ) : (
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
            {JSON.stringify(patients.data, null, 2)}
          </pre>
        )}
      </section>
    </main>
  )
}
