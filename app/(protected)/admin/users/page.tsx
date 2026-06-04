import Link from "next/link";
import { requireRoles } from "@/lib/auth-guard";
import { listUsers } from "@/lib/keycloak-admin";
import type { KeycloakUser } from "@/types/user";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const { username } = await requireRoles(["admin"]);

  let users: KeycloakUser[] = [];
  let fetchError = "";
  try {
    users = await listUsers();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "無法載入使用者資料";
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
            <Link href="/admin" className="hover:text-gray-600 transition-colors">Admin</Link>
            <span>›</span>
            <span className="text-gray-600">使用者管理</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">使用者管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理 <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">{process.env.KEYCLOAK_REALM}</code> realm 的 Keycloak 帳號
          </p>
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

      {fetchError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-red-800">載入失敗</p>
              <p className="mt-1 text-sm text-red-700">{fetchError}</p>
              <p className="mt-2 text-xs text-red-500">
                請確認 Keycloak client <code className="font-mono">nextjs-bff</code> 已啟用 Service Account 並賦予{" "}
                <code className="font-mono">realm-management → manage-users</code> 角色。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <UsersClient initialUsers={users} />
      )}
    </main>
  );
}

