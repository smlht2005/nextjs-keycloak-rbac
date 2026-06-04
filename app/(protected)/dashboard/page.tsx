import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-guard";
import { ROLE_PERMISSIONS } from "@/types/auth";

type PatientResult = { data: unknown[] } | { error: string };

async function fetchPatients(accessToken: string): Promise<PatientResult> {
  try {
    const res = await fetch(`${process.env.PATIENT_SERVICE_URL}/patients`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return { error: `上游服務回應 HTTP ${res.status}` };
    const json = await res.json();
    return { data: Array.isArray(json) ? json : (json.data ?? []) };
  } catch {
    return { error: "病患服務暫不可用（PATIENT_SERVICE_URL 未啟動）" };
  }
}

export default async function DashboardPage() {
  const { username, email, fullName, roles, payload, accessToken } =
    await requireAuth();

  // Admin users go directly to user management
  if (roles.includes('admin')) {
    redirect('/admin/users');
  }

  const permissions = [
    ...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? [])),
  ];
  const tokenExpiry = payload.exp
    ? new Date(payload.exp * 1000).toLocaleString("zh-TW")
    : "N/A";
  const patients = await fetchPatients(accessToken);

  const roleColorMap: Record<string, string> = {
    doctor: "bg-blue-100 text-blue-700",
    nurse:  "bg-emerald-100 text-emerald-700",
    viewer: "bg-gray-100 text-gray-600",
    admin:  "bg-purple-100 text-purple-700",
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* ── Header ── */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">儀表板</h1>
          <p className="mt-1 text-sm text-gray-500">Hospital Information System</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3.5 py-2 text-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white select-none">
            {username.slice(0, 1).toUpperCase()}
          </div>
          <span className="font-medium text-gray-700">{username}</span>
          <div className="mx-1 h-4 w-px bg-gray-300" />
          <a
            href="/api/auth/logout"
            aria-label="登出"
            title="登出"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-red-100 hover:text-red-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </a>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── 使用者資訊 ── */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">使用者資訊</h2>
          </div>
          <dl className="divide-y divide-gray-50">
            {[
              { label: "帳號", value: username },
              { label: "全名",  value: fullName || "—" },
              { label: "Email", value: email   || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center px-6 py-3.5">
                <dt className="w-28 flex-shrink-0 text-sm text-gray-500">{label}</dt>
                <dd className="text-sm font-medium text-gray-800">{value}</dd>
              </div>
            ))}
            <div className="flex items-center px-6 py-3.5">
              <dt className="w-28 flex-shrink-0 text-sm text-gray-500">角色</dt>
              <dd className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <span key={r} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleColorMap[r] ?? "bg-gray-100 text-gray-600"}`}>
                    {r}
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex items-start px-6 py-3.5">
              <dt className="w-28 flex-shrink-0 text-sm text-gray-500">權限</dt>
              <dd className="flex flex-wrap gap-1.5">
                {permissions.map((p) => (
                  <span key={p} className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                    {p}
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex items-center px-6 py-3.5">
              <dt className="w-28 flex-shrink-0 text-sm text-gray-500">Token 到期</dt>
              <dd className="text-sm text-gray-500 font-mono">{tokenExpiry}</dd>
            </div>
          </dl>
        </section>

        {/* ── 病患列表 ── */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">病患列表</h2>
          </div>
          <div className="px-6 py-5">
            {"error" in patients ? (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {patients.error}
              </div>
            ) : patients.data.length === 0 ? (
              <p className="text-sm text-gray-400">目前無病患資料</p>
            ) : (
              <pre className="rounded-lg bg-gray-50 p-4 text-xs overflow-auto text-gray-700">
                {JSON.stringify(patients.data, null, 2)}
              </pre>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
