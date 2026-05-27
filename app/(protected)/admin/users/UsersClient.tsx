"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500",
  "bg-amber-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500",
];

function Avatar({ name, username }: { name: string; username: string }) {
  const initials = name
    ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : username.slice(0, 2).toUpperCase();
  const color = AVATAR_COLORS[username.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${color}`}>
      {initials}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset
      ${enabled
        ? "bg-green-50 text-green-700 ring-green-600/20"
        : "bg-red-50 text-red-700 ring-red-600/20"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-green-500" : "bg-red-500"}`} />
      {enabled ? "啟用" : "停用"}
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error";

function Toast({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-lg text-sm font-medium text-white transition-all
      ${type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
      {type === "success"
        ? <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        : <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="ml-4 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Form Field ───────────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
    />
  );
}

// ─── UserForm ─────────────────────────────────────────────────────────────────

function UserForm({ form, isEdit, saving, error, onChange, onSubmit, onCancel }: {
  form: FormState;
  isEdit: boolean;
  saving: boolean;
  error: string;
  onChange: (f: Partial<FormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [showPwd, setShowPwd] = useState(false);

  return (
    <div className="space-y-4">
      {!isEdit && (
        <Field label="帳號" required>
          <Input
            value={form.username}
            onChange={(v) => onChange({ username: v })}
            placeholder="例：john.doe"
          />
        </Field>
      )}

      <Field label="Email">
        <Input
          value={form.email}
          onChange={(v) => onChange({ email: v })}
          type="email"
          placeholder="user@hospital.local"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="姓（Last Name）">
          <Input
            value={form.lastName}
            onChange={(v) => onChange({ lastName: v })}
            placeholder="王"
          />
        </Field>
        <Field label="名（First Name）">
          <Input
            value={form.firstName}
            onChange={(v) => onChange({ firstName: v })}
            placeholder="小明"
          />
        </Field>
      </div>

      <Field label={isEdit ? "新密碼" : "密碼"} hint={isEdit ? "留空則不變更密碼" : undefined}>
        <div className="relative">
          <Input
            value={form.password}
            onChange={(v) => onChange({ password: v })}
            type={showPwd ? "text" : "password"}
            placeholder={isEdit ? "（留空不變）" : "請輸入密碼"}
          />
          <button
            type="button"
            onClick={() => setShowPwd((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPwd
              ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
              : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-700">帳號狀態</p>
          <p className="text-xs text-gray-400">{form.enabled ? "帳號目前為啟用狀態" : "帳號已停用，使用者無法登入"}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ enabled: !form.enabled })}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            ${form.enabled ? "bg-blue-600" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${form.enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving && <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UsersClient({ initialUsers }: { initialUsers: KeycloakUser[] }) {
  const [users, setUsers] = useState<KeycloakUser[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<KeycloakUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KeycloakUser | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = (message: string, type: ToastType = "success") => setToast({ message, type });

  const patchForm = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Search ─────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bff/users?search=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error(await res.text());
      setUsers(await res.json());
    } catch {
      showToast("搜尋失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [search]);

  const handleClearSearch = async () => {
    setSearch("");
    setLoading(true);
    try {
      const res = await fetch("/api/bff/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  // ── Create ─────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.username.trim()) { setFormError("帳號為必填欄位"); return; }
    setSaving(true); setFormError("");
    try {
      const res = await fetch("/api/bff/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "建立失敗");
      const listRes = await fetch("/api/bff/users");
      if (listRes.ok) setUsers(await listRes.json());
      setCreateOpen(false);
      showToast(`使用者 ${form.username} 已建立`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const openEdit = (user: KeycloakUser) => {
    setEditTarget(user);
    setForm({ username: user.username, email: user.email ?? "", firstName: user.firstName ?? "", lastName: user.lastName ?? "", enabled: user.enabled, password: "" });
    setFormError("");
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSaving(true); setFormError("");
    try {
      const res = await fetch(`/api/bff/users/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email || undefined, firstName: form.firstName || undefined, lastName: form.lastName || undefined, enabled: form.enabled, password: form.password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "更新失敗");
      setUsers((prev) => prev.map((u) => u.id === editTarget.id ? { ...u, email: form.email || undefined, firstName: form.firstName || undefined, lastName: form.lastName || undefined, enabled: form.enabled } : u));
      setEditTarget(null);
      showToast(`使用者 ${editTarget.username} 已更新`);
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
      const res = await fetch(`/api/bff/users/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "刪除失敗"); }
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      showToast(`使用者 ${deleteTarget.username} 已刪除`);
      setDeleteTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "刪除失敗", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const enabledCount = users.filter((u) => u.enabled).length;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "總使用者", value: users.length, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "啟用", value: enabledCount, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "停用", value: users.length - enabledCount, color: "text-red-500", bg: "bg-red-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl ${s.bg} px-5 py-4`}>
            <p className="text-xs font-medium text-gray-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="搜尋帳號或 Email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {search && (
            <button onClick={handleClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading
            ? <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
          搜尋
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          新增使用者
        </button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <p className="text-sm font-medium text-gray-900">找不到使用者</p>
            <p className="mt-1 text-xs text-gray-400">{search ? "嘗試不同的搜尋關鍵字" : "點擊「新增使用者」來建立第一個帳號"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">使用者</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">狀態</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => {
                const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
                return (
                  <tr key={u.id} className="group hover:bg-blue-50/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={fullName} username={u.username} />
                        <div>
                          <p className="font-medium text-gray-900">{u.username}</p>
                          {fullName && <p className="text-xs text-gray-400">{fullName}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-500">{u.email || <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-4"><StatusBadge enabled={u.enabled} /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(u)}
                          title="編輯"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          title="刪除"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-100 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3">
          <p className="text-xs text-gray-400">共 <span className="font-medium text-gray-600">{users.length}</span> 位使用者</p>
        </div>
      </div>

      {/* Create Modal */}
      {createOpen && (
        <Modal title="新增使用者" subtitle="建立新的 Keycloak 帳號" onClose={() => setCreateOpen(false)}>
          <UserForm form={form} isEdit={false} saving={saving} error={formError} onChange={patchForm} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
        </Modal>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <Modal title="編輯使用者" subtitle={`@${editTarget.username}`} onClose={() => setEditTarget(null)}>
          <UserForm form={form} isEdit={true} saving={saving} error={formError} onChange={patchForm} onSubmit={handleUpdate} onCancel={() => setEditTarget(null)} />
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal title="確認刪除" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-4 rounded-xl border border-red-100 bg-red-50 p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">此操作無法復原</p>
                <p className="mt-1 text-sm text-red-700">
                  確定要永久刪除使用者 <span className="font-semibold">@{deleteTarget.username}</span>？
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={handleDelete} disabled={saving} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                {saving && <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                {saving ? "刪除中…" : "確認刪除"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

