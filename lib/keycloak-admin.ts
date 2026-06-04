import { keycloakConfig } from "@/lib/keycloak-config";
import type {
  CreateUserPayload,
  KeycloakUser,
  UpdateUserPayload,
} from "@/types/user";

const adminBase = () =>
  `${keycloakConfig.internalUrl}/admin/realms/${keycloakConfig.realm}`;

async function getAdminToken(): Promise<string> {
  const tokenUrl = `${keycloakConfig.internalUrl}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: keycloakConfig.clientId,
      client_secret: keycloakConfig.clientSecret,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get admin token: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

export async function listUsers(
  search?: string,
  max = 50,
): Promise<KeycloakUser[]> {
  const token = await getAdminToken();
  const url = new URL(`${adminBase()}/users`);
  if (search) url.searchParams.set("search", search);
  url.searchParams.set("max", String(max));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`List users failed: ${res.status}`);
  return res.json() as Promise<KeycloakUser[]>;
}

export async function getUser(id: string): Promise<KeycloakUser> {
  const token = await getAdminToken();
  const res = await fetch(`${adminBase()}/users/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Get user failed: ${res.status}`);
  return res.json() as Promise<KeycloakUser>;
}

export async function createUser(payload: CreateUserPayload): Promise<string> {
  const token = await getAdminToken();
  const res = await fetch(`${adminBase()}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Create user failed: ${res.status} ${body}`);
  }
  // Keycloak returns new user ID via Location header
  const location = res.headers.get("Location") ?? "";
  return location.split("/").pop() ?? "";
}

export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<void> {
  const token = await getAdminToken();
  const res = await fetch(`${adminBase()}/users/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update user failed: ${res.status} ${body}`);
  }
}

export async function deleteUser(id: string): Promise<void> {
  const token = await getAdminToken();
  const res = await fetch(`${adminBase()}/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Delete user failed: ${res.status}`);
}

export async function resetUserPassword(
  id: string,
  password: string,
  temporary = true,
): Promise<void> {
  const token = await getAdminToken();
  const res = await fetch(`${adminBase()}/users/${id}/reset-password`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "password", value: password, temporary }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Reset password failed: ${res.status}`);
}
