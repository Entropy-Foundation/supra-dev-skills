import * as jose from 'jose';
import nacl from 'tweetnacl';
import { sha3_256 } from 'js-sha3';
import { normalizeAddress } from '@/lib/address';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined');
}

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

// Nonce expiration: 5 minutes
const NONCE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Create a JWT token for the given address
 */
export async function createToken(address: string): Promise<string> {
  return await new jose.SignJWT({ address })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);
}

/**
 * Verify a JWT token
 */
export async function verifyToken(token: string | undefined) {
  if (!token) return null;
  
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as { address: string };
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

/**
 * Create a time-based, cryptographically signed nonce
 * Format: timestamp|randomBytes|signature
 * This allows validation without server-side storage
 */
export async function createNonce(): Promise<string> {
  const timestamp = Date.now().toString();
  
  // Generate random bytes for uniqueness
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Create signature of timestamp|random to prevent tampering
  const payload = `${timestamp}|${randomHex}`;
  const signature = await new jose.SignJWT({ payload })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);
  
  // Return: timestamp|random|signature
  return `${payload}|${signature}`;
}

/**
 * Validate a time-based nonce
 * Checks:
 * 1. Nonce format is valid
 * 2. Signature is authentic (proves it came from our server)
 * 3. Timestamp is within expiration window (prevents replay attacks)
 */
export async function validateNonce(nonce: string): Promise<boolean> {
  try {
    // Parse nonce format: timestamp|random|signature
    const parts = nonce.split('|');
    if (parts.length !== 3) {
      console.error('Invalid nonce format');
      return false;
    }
    
    const [timestamp, random, signature] = parts;
    const payload = `${timestamp}|${random}`;
    
    // Verify the signature
    try {
      const { payload: verified } = await jose.jwtVerify(signature, secret);
      
      // Check if the payload matches
      if (verified.payload !== payload) {
        console.error('Nonce payload mismatch');
        return false;
      }
    } catch (error) {
      console.error('Nonce signature verification failed:', error);
      return false;
    }
    
    // Check timestamp is within expiration window
    const nonceTimestamp = parseInt(timestamp, 10);
    const now = Date.now();
    const age = now - nonceTimestamp;
    
    if (age > NONCE_EXPIRY_MS) {
      console.error('Nonce expired:', { age, limit: NONCE_EXPIRY_MS });
      return false;
    }
    
    // Check nonce is not from the future (clock skew tolerance: 1 minute)
    if (age < -60000) {
      console.error('Nonce timestamp is in the future');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Nonce validation error:', error);
    return false;
  }
}

/** Strips an optional 0x and returns the bytes. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('Not hex');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * The account address a single Ed25519 public key controls.
 *
 * Supra inherits Aptos's derivation: the authentication key is
 * `sha3_256(public_key_bytes || 0x00)`, where the trailing byte is the
 * single-Ed25519 scheme identifier. For an account that has not rotated its
 * key, the address equals that authentication key.
 *
 * Note the limitation this carries. An account that HAS rotated its key, or a
 * multi-key account, does not derive back to its address and cannot sign in
 * through this route. To support those, read the on-chain authentication key
 * for `address` and compare against that instead.
 */
export function deriveSupraAddress(publicKey: string): string | null {
  try {
    const key = hexToBytes(publicKey);
    const input = new Uint8Array(key.length + 1);
    input.set(key, 0);
    input[key.length] = 0x00; // single Ed25519 scheme
    return normalizeAddress(sha3_256(input));
  } catch {
    return null;
  }
}

/**
 * Verify a wallet signature and that the signing key controls `address`.
 *
 * `message` is the text the client was asked to sign: `authMessageFor(nonce)`.
 * Passing anything else here - in particular the bare AUTH_MESSAGE - makes the
 * nonce decorative and the signature replayable.
 */
export async function verifyWalletSignature(
  message: string,
  signature: { signature: string; publicKey: string },
  address: string
): Promise<boolean> {
  try {
    // Verify the signature using Ed25519 (nacl). hexToBytes rather than
    // Buffer: this runs on the edge runtime, where Buffer is not guaranteed.
    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      hexToBytes(signature.signature),
      hexToBytes(signature.publicKey)
    );
    
    if (!verified) {
      console.error('Signature verification failed');
      return false;
    }
    
    // Step 2: that public key actually controls the address being claimed.
    //
    // WITHOUT THIS CHECK THE ROUTE IS AN AUTHENTICATION BYPASS. The check
    // above only proves the caller holds *some* key. An attacker signs
    // AUTH_MESSAGE with their own key, sends any `address` they like, and the
    // server mints a JWT for it - taking over any account on the app.
    const derived = deriveSupraAddress(signature.publicKey);
    if (!derived || derived !== normalizeAddress(address)) {
      console.error('Public key does not control the claimed address');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Wallet signature verification error:', error);
    return false;
  }
} 