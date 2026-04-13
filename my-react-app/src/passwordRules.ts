export function isValidEmailFormat(email: string): boolean {
  const e = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > 128) {
    return 'Password is too long.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include a digit.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include a symbol (e.g. !@#$%).';
  }
  return null;
}
