"use client";

import { useState, useCallback } from "react";
import type { KeycloakUser } from "@/types/user";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormState {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  password: string;
}

const EMPTY_FORM: FormState = {
  username: "",
  email: "",
  firstName: "",
  lastName: "",
  enabled: true,
  password: "",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Badge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {enabled ? "啟用" : "停用"}
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function UserForm({
  form,
  isEdit,
  saving,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: FormState;
  isEdit: boolean;
  saving: boolean;
  error: string;
  onChange: (f: Partial<FormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const field = (
    label: string,
    key: keyof FormState,
    type = "text",
    required = false,
  ) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={form[key] as string}
        onChange={(e) => onChange({ [key]: e.target.value })}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        autoComplete="off"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {!isEdit && field("帳號 (username)", "username", "text", true)}
      {field("Email", "email", "email")}
      {field("姓", "firstName")}
      {field("名", "lastName")}
      {field("密碼（留空不變）", "password", "password")}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={form.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        <label htmlFor="enabled" className="text-sm text-gray-700">
          帳號啟用
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UsersClient({
  initialUsers,
}: {
  initialUsers: KeycloakUser[];
}) {
  const [users, setUsers] = useState<KeycloakUser[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<KeycloakUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KeycloakUser | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const patchForm = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  // ── Search ─────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/bff/users?search=${encodeURIComponent(search)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, [search]);

  // ── Create ─────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.username.trim()) {
      setFormError("帳號為必填欄位");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/bff/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "建立失敗");
      // Refresh list
      const listRes = await fetch("/api/bff/users");
      if (listRes.ok) setUsers(await listRes.json());
      setCreateOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const openEdit = (user: KeycloakUser) => {
    setEditTarget(user);
    setForm({
      username: user.username,
      email: user.email ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      enabled: user.enabled,
      password: "",
    });
    setFormError("");
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/bff/users/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email || undefined,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          enabled: form.enabled,
          password: form.password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "更新失敗");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editTarget.id
            ? {
                ...u,
                email: form.email || undefined,
                firstName: form.firstName || undefined,
                lastName: form.lastName || undefined,
                enabled: form.enabled,
              }
            : u,
        ),
      );
      setEditTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bff/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "刪除失敗");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="搜尋帳號 / Email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="rounded bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? "搜尋中…" : "搜尋"}
        </button>
        <button
          onClick={openCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          ＋ 新增使用者
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">帳號</th>
              <th className="px-4 py-3">姓名</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">狀態</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  無使用者資料
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3 text-gray-600">
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email || "—"}</td>
                <td className="px-4 py-3">
                  <Badge enabled={u.enabled} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(u)}
                    className="mr-2 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => setDeleteTarget(u)}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">共 {users.length} 位使用者</p>

      {/* Create Modal */}
      {createOpen && (
        <Modal title="新增使用者" onClose={() => setCreateOpen(false)}>
          <UserForm
            form={form}
            isEdit={false}
            saving={saving}
            error={formError}
            onChange={patchForm}
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <Modal
          title={`編輯：${editTarget.username}`}
          onClose={() => setEditTarget(null)}
        >
          <UserForm
            form={form}
            isEdit={true}
            saving={saving}
            error={formError}
            onChange={patchForm}
            onSubmit={handleUpdate}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal title="確認刪除" onClose={() => setDeleteTarget(null)}>
          <p className="mb-4 text-gray-700">
            確定要刪除使用者{" "}
            <span className="font-semibold text-red-600">
              {deleteTarget.username}
            </span>
            ？ 此操作無法復原。
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "刪除中…" : "確認刪除"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
