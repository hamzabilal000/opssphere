// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// We NEVER store a user's real password anywhere — not in the database, not
// in a log line, nowhere. Instead we store a "hash": the output of running
// the password through a one-way scrambling function. "One-way" means you
// can turn a password INTO a hash easily, but you can't turn a hash back
// INTO the original password. To check a login attempt, we hash the
// password the user just typed and compare the two hashes — we never need
// to "unscramble" anything.
//
// "bcryptjs" is the library doing the actual scrambling. It's slower than a
// normal hash on purpose — that's a security feature, not a bug, because it
// makes it much harder for an attacker to guess millions of passwords per
// second if your database ever leaks.
// ============================================================================

import bcrypt from "bcryptjs";

// SALT_ROUNDS controls HOW MUCH work bcrypt does per password — higher
// number = slower = more secure, but also more CPU time per login. 12 is a
// solid, commonly recommended default for a real app.
const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

// Returns true if `plainTextPassword` matches the given hash, false
// otherwise. This is the ONLY way we ever check a password — we never
// compare plain text strings directly.
export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
