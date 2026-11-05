// Shared by the signup form (live hint) and the server (enforcement).
// Based on length and common patterns, not composition rules, as NIST SP 800-63B recommends.
const COMMON = new Set(['password', 'passwords', 'passphrase', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'iloveyou', 'letmein', 'welcome',
  'admin', 'administrator', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess', 'superman', 'batman', 'trustno', 'starwars',
  'shadow', 'master', 'michael', 'jordan', 'abc', 'abcdef', 'abcdefgh', 'abcdefghijkl', 'abcdefghijklmnopqrstuvwxyz', 'changeme', 'secret',
  'fishodoro', 'fishing', 'pomodoro', 'login', 'test', 'testing', 'default', 'hello', 'freedom', 'whatever', 'qazwsx', 'qazwsxedc', 'mypassword',
  'passwordpassword', 'correcthorsebatterystaple', 'thequickbrownfox', 'pleaseletmein']);

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 128;

// Returns an error message, or null when the password is acceptable.
export function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  const lower = password.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, '');
  const local = email.toLowerCase().split('@')[0];
  if (local.length >= 4 && lower.includes(local)) return "Don't use your email address in your password.";
  if (COMMON.has(letters) || COMMON.has(lower)) return 'That password is too common.';
  if (/^(.{1,6})\1+$/.test(lower)) return "Avoid repeating the same characters.";
  if (new Set(lower).size < 5) return 'Use more varied characters.';
  return null;
}
