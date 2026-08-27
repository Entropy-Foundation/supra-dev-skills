import { NextResponse } from 'next/server';
import { createToken, validateNonce, verifyWalletSignature } from '@/lib/auth';
import { AUTH_MESSAGE } from '@/lib/auth-constants';

export const runtime = 'edge';

// AUTH_MESSAGE is imported, never re-declared here. It is verified byte-for-byte
// against what the client signed, so a second copy of the string is a silent 401
// waiting for someone to edit one and not the other.

export async function POST(request: Request) {
  try {
    const { address, signature, nonce } = await request.json();
    
    // Validate all required fields are present
    if (!address || !signature || !nonce) {
      return NextResponse.json(
        { error: 'Missing required fields: address, signature, and nonce are required' },
        { status: 400 }
      );
    }

    // Validate signature structure
    if (!signature.signature || !signature.publicKey) {
      return NextResponse.json(
        { error: 'Invalid signature format: must include signature and publicKey' },
        { status: 400 }
      );
    }

    // Step 1: Validate the nonce
    // This ensures the signature is recent (within 5 minutes) and prevents replay attacks
    const nonceValid = await validateNonce(nonce);
    if (!nonceValid) {
      return NextResponse.json(
        { error: 'Invalid or expired nonce. Please request a new nonce and try again.' },
        { status: 401 }
      );
    }

    // Step 2: Verify the wallet signature
    // This cryptographically proves the user owns the private key for the claimed address
    const signatureValid = await verifyWalletSignature(
      AUTH_MESSAGE,
      signature,
      address
    );

    if (!signatureValid) {
      return NextResponse.json(
        { error: 'Invalid signature. Signature verification failed.' },
        { status: 401 }
      );
    }

    // Step 3: Create and return the JWT token
    // At this point, we've proven:
    // 1. The nonce is valid and recent (anti-replay)
    // 2. The signature is cryptographically valid (proof of ownership)
    const token = await createToken(address);
    
    return NextResponse.json({ 
      token,
      address, // Echo back for confirmation
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
} 