/**
 * useConversionUtils.ts
 *
 * BCS serialization helpers for Move entry function arguments.
 *
 * Move entry functions require BCS-serialized bytes (Uint8Array[]), not raw
 * JavaScript values. This hook wraps supra-ts-sdk's BCS and
 * TxnBuilderTypes utilities into easy-to-use named helpers.
 *
 * USAGE:
 *   import useConversionUtils from '@/hooks/useConversionUtils';
 *
 *   function MyComponent() {
 *     const { addressToUint8Array, serializeUint64 } = useConversionUtils();
 *     // use in sendRawTransaction params array
 *   }
 *
 * Copy this file to: hooks/useConversionUtils.ts in your Next.js project.
 *
 * DEPENDENCY: supra-ts-sdk  (already installed as part of this skill's deps)
 */

"use client";

import { BCS, TxnBuilderTypes } from "supra-ts-sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversionUtils {
    /**
     * Converts a hex address string (e.g. "0x1" or full 64-char hex) into a
     * BCS-serialized Uint8Array suitable for passing as an `address` argument
     * to a Move entry function.
     *
     * This is the non-obvious one: it wraps BCS.bcsToBytes(
     *   TxnBuilderTypes.AccountAddress.fromHex(addr)
     * ) so you don't have to.
     */
  addressToUint8Array: (address: string) => Uint8Array;

  /** Serialize a number as a Move `u8` (1 byte). */
  serializeUint8: (value: number) => Uint8Array;

  /** Serialize a number as a Move `u16` (2 bytes, little-endian). */
  serializeUint16: (value: number | bigint) => Uint8Array;

  /** Serialize a number as a Move `u32` (4 bytes, little-endian). */
  serializeUint32: (value: number | bigint) => Uint8Array;

  /**
     * Serialize a bigint as a Move `u64` (8 bytes, little-endian).
     *
     * IMPORTANT — always use bigint for u64 values:
     *   serializeUint64(BigInt(Math.floor(amount * 1e8)))
     *
     * JavaScript numbers lose precision above 2^53. For SUPRA amounts
     * (8 decimals), multiply user input by 100_000_000 before passing here.
     * Example: 1.5 SUPRA → serializeUint64(BigInt(150_000_000))
     */
  serializeUint64: (value: bigint | number) => Uint8Array;

  /**
     * Serialize a bigint as a Move `u128` (16 bytes, little-endian).
     * Use for contract amounts that exceed u64 range.
     */
  serializeUint128: (value: bigint | number) => Uint8Array;

  /**
     * Serialize a UTF-8 string as a Move `0x1::string::String` (BCS string).
     * Encodes the length prefix + UTF-8 bytes.
     */
  serializeString: (value: string) => Uint8Array;

  /** Serialize a boolean as a Move `bool` (1 byte: 0x01 or 0x00). */
  serializeBool: (value: boolean) => Uint8Array;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns BCS serialization helpers for building Move entry function arguments.
 * Memoized — safe to call at the top of any component or custom hook.
 *
 * @example
 * const { addressToUint8Array, serializeUint64 } = useConversionUtils();
 *
 * const txHash = await sendRawTransaction(
 *   "0x0000000000000000000000000000000000000000000000000000000000000001",
 *   "supra_account",
 *   "transfer_coins",
 *   [
 *     addressToUint8Array(recipientAddress),
 *     serializeUint64(BigInt(Math.floor(amountSupra * 100_000_000))),
 *   ],
 *   ["0x1::supra_coin::SupraCoin"],
 * );
 */
export default function useConversionUtils(): ConversionUtils {
    // ── address ──────────────────────────────────────────────────────────────

  const addressToUint8Array = (address: string): Uint8Array => {
        return BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(address));
  };

  // ── unsigned integers ─────────────────────────────────────────────────────

  const serializeUint8 = (value: number): Uint8Array => {
        return BCS.bcsSerializeU8(value);
  };

  const serializeUint16 = (value: number | bigint): Uint8Array => {
        return BCS.bcsSerializeU16(Number(value));
  };

  const serializeUint32 = (value: number | bigint): Uint8Array => {
        return BCS.bcsSerializeU32(Number(value));
  };

  const serializeUint64 = (value: bigint | number): Uint8Array => {
        // Always coerce to bigint to avoid precision loss on large values.
        return BCS.bcsSerializeUint64(BigInt(value));
  };

  const serializeUint128 = (value: bigint | number): Uint8Array => {
        return BCS.bcsSerializeU128(BigInt(value));
  };

  // ── string & bool ─────────────────────────────────────────────────────────

  const serializeString = (value: string): Uint8Array => {
        return BCS.bcsSerializeStr(value);
  };

  const serializeBool = (value: boolean): Uint8Array => {
        return BCS.bcsSerializeBool(value);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return {
        addressToUint8Array,
        serializeUint8,
        serializeUint16,
        serializeUint32,
        serializeUint64,
        serializeUint128,
        serializeString,
        serializeBool,
  };
}
