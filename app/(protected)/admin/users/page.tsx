import { requireRoles } from "@/lib/auth-guard";
import { listUsers } from "@/lib/keycloak-admin";
import type { KeycloakUser } from "@/types/user";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  await requireRoles(["admin"]);

  let users: KeycloakUser[] = [];
  let fetchError = "";
  try {
    users = await listUsers();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "無法載入使用者資料";
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">使用者管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          透過 Keycloak Admin API 管理{" "}
          <code className="font-mono">{process.env.KEYCLOAK_REALM}</code> realm
          的使用者
        </p>
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>載入失敗：</strong> {fetchError}
          <p className="mt-1 text-xs text-red-500">
            請確認 Keycloak client <code>nextjs-bff</code> 已啟用 Service
            Account 並賦予 <code>realm-management → manage-users</code> 角色。
          </p>
        </div>
      ) : (
        <UsersClient initialUsers={users} />
      )}
    </main>
  );
}
