// Criptografia com Web Crypto (funciona igual no Deno do Supabase e no Node dos testes).

const enc = new TextEncoder();
export const PBKDF2_ITERATIONS = 310000; // PBKDF2-HMAC-SHA256, recomendação OWASP para esse algoritmo

function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export function randomToken(n = 32) {
  return b64(randomBytes(n)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2-sha256') return false;
  const got = await pbkdf2(password, unb64(salt), Number(iter));
  return timingSafeEqual(got, unb64(hash));
}

// Hash fixo usado quando o usuário não existe, para o tempo de resposta não revelar isso.
export const DUMMY_HASH = 'pbkdf2-sha256$310000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

// Códigos de recuperação: 16 caracteres em base32 sem letras ambíguas (80 bits de entropia).
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 símbolos; usamos rejeição para não enviesar
export function recoveryCode() {
  let out = '';
  while (out.length < 16) {
    const b = randomBytes(1)[0];
    if (b < 248) out += ALPHA[b % 31];
  }
  return out.match(/.{4}/g).join('-');
}

export function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
