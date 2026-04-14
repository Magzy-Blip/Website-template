const users_key = 'produce_registered_users_v1';

export interface RegisteredUser {
  email: string;
  name: string;
  password: string;
}

function load_users(): RegisteredUser[] {
  try {
    const raw = localStorage.getItem(users_key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (u): u is RegisteredUser =>
        u &&
        typeof u === 'object' &&
        typeof (u as RegisteredUser).email === 'string' &&
        typeof (u as RegisteredUser).password === 'string',
    );
  } catch {
    return [];
  }
}

function save_users(users: RegisteredUser[]): void {
  localStorage.setItem(users_key, JSON.stringify(users));
}

export function register_user(
  name: string,
  email: string,
  password: string,
): { ok: true } | { ok: false; message: string } {
  const e = email.trim().toLowerCase();
  const users = load_users();
  if (users.some((u) => u.email === e)) {
    return { ok: false, message: 'An account with this email already exists.' };
  }
  users.push({ email: e, name: name.trim(), password });
  save_users(users);
  return { ok: true };
}

export function login_user(
  email: string,
  password: string,
): { ok: true; name: string } | { ok: false; message: string } {
  const e = email.trim().toLowerCase();
  const users = load_users();
  const u = users.find((x) => x.email === e);
  if (!u || u.password !== password) {
    return { ok: false, message: 'Invalid email or password.' };
  }
  return { ok: true, name: u.name };
}
