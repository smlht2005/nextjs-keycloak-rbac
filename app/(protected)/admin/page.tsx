import Link from "next/link";
import { requireRoles } from "@/lib/auth-guard";

export default async function AdminPage() {
  await requireRoles(["admin"]);
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Admin Panel</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/users"
          className="flex flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-blue-400 hover:shadow-md transition-all"
        >
          <span className="text-2xl mb-2">👥</span>
          <span className="font-semibold text-gray-900">使用者管理</span>
          <span className="mt-1 text-sm text-gray-500">
            新增、編輯、停用 Keycloak 使用者
          </span>
        </Link>
      </div>
    </main>
  );
}
