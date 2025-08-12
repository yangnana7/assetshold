const crypto = require('crypto');
const argon2 = require('argon2');

function requireSessionSecretOrExit() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) {
    console.error('SESSION_SECRET is required and must be long random.');
    process.exit(1);
  }
}

async function hashPassword(pw) {
  return argon2.hash(pw, { type: argon2.argon2id, memoryCost: 2 ** 16 });
}

async function verifyPassword(hash, pw) {
  return argon2.verify(hash, pw);
}

module.exports = { requireSessionSecretOrExit, hashPassword, verifyPassword };
