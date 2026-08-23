const PBKDF2_ITERATIONS = 600000;

function encode(bytes) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derive(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  ));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return { algorithm: "PBKDF2-SHA-256", iterations: PBKDF2_ITERATIONS, salt: encode(salt), hash: encode(hash) };
}

export async function verifyPassword(password, stored) {
  const actual = await derive(password, decode(stored.salt));
  const expected = decode(stored.hash);

  if (actual.length !== expected.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }

  return difference === 0;
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return encode(new Uint8Array(digest));
}

export function randomToken(bytes = 32) {
  return encode(crypto.getRandomValues(new Uint8Array(bytes)));
}