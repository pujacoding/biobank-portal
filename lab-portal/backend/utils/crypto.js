import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password using bcrypt
 * @param {string} password 
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  if (!password) throw new Error("Password is required for hashing.");
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against its bcrypt hash
 * @param {string} password 
 * @param {string} hash 
 * @returns {Promise<boolean>}
 */
export async function comparePassword(password, hash) {
  if (!password || !hash) return false;
  return await bcrypt.compare(password, hash);
}

/**
 * Generates a 6-digit numeric OTP
 * @returns {string}
 */
export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
