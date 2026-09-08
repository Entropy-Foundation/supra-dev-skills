import { NextResponse } from 'next/server';
import { createToken, validateNonce, verifyWalletSignature } from '@/lib/auth';
import { authMessageFor } from '@/lib/auth-constants';

export const runtime = 'edge';

// authMessageFor is imported, never re-implemented here. The text is verified
// byte-for-byte against what the client signed, so a second copy of the format
// is a silent 401 waiting for someone to edit one and not the other.
//
// The nonce is validated AND is part of the signed text. Validating it alone is
// not enough: StarKey signs only the message bytes, so a signature over a
// constant string could be replayed with any fresh nonce, forever.

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

    // Step 2: Verify the wallet signature over AUTH_MESSAGE + this nonce.
    // This proves the caller controls the claimed address AND that the
    // signature was produced for this nonce, not captured from an earlier login.
    const signatureValid = await verifyWalletSignature(
      authMessageFor(nonce),
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
    // 1. The nonce is valid, recent, and inside the signed bytes (anti-replay)
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