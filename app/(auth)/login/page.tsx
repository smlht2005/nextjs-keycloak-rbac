export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white px-8 py-10 shadow-sm">
          {/* Logo / Title */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-md">
              <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Hospital Information System</h1>
            <p className="mt-1 text-sm text-gray-400">請登入以繼續</p>
          </div>

          {/* Primary: Sign in */}
          <a
            href="/api/auth/login"
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Sign in with Keycloak
          </a>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-xs text-gray-400">或</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          {/* Secondary: Switch account */}
          <a
            href="/api/auth/switch"
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            切換帳號登入
          </a>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Hospital RBAC &copy; {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
