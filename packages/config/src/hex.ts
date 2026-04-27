import type { Hex } from "./types";

export const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;

const UINT64_MAX = (1n << 64n) - 1n;
const textEncoder = new TextEncoder();

/**
 * Validates a hex string and optionally checks its byte length.
 */
export function assertHex(value: Hex, byteLength?: number): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error("Expected hex string");
  }
  if (value.length % 2 !== 0) {
    throw new Error("Expected even-length hex string");
  }
  if (byteLength !== undefined && (value.length - 2) / 2 !== byteLength) {
    if (byteLength === 65) {
      throw new Error("Expected 65-byte signature");
    }
    throw new Error(`Expected ${byteLength}-byte hex string`);
  }
  return value as Hex;
}

/**
 * Normalizes and validates a bytes32 value.
 */
export function normalizeBytes32(value: Hex): Hex {
  return assertHex(value, 32).toLowerCase() as Hex;
}

/**
 * Normalizes and validates a 4-byte selector.
 */
export function normalizeSelector(value: Hex): Hex {
  return assertHex(value, 4).toLowerCase() as Hex;
}

/**
 * Validates an address and returns it with either original or lower-case casing.
 */
export function normalizeAddress(value: Hex, mode: "lower" | "preserve"): Hex {
  const address = assertHex(value, 20);
  if (mode === "lower") {
    return address.toLowerCase() as Hex;
  }
  return value as Hex;
}

/**
 * Validates a bigint fits Solidity's uint256 range.
 */
export function assertUint256(value: bigint): bigint {
  if (value < 0n || value >= 1n << 256n) {
    throw new Error("uint256 value out of range");
  }
  return value;
}

/**
 * Validates a bigint fits Solidity's uint64 range.
 */
export function assertUint64(value: bigint): bigint {
  if (value < 0n || value > UINT64_MAX) {
    throw new Error("uint64 value out of range");
  }
  return value;
}

/**
 * ABI-encodes an address into a 32-byte word.
 */
export function encodeAddress(address: Hex): Uint8Array {
  return concatBytes(new Uint8Array(12), hexToBytes(normalizeAddress(address, "lower")));
}

/**
 * ABI-encodes a uint256 into a 32-byte word.
 */
export function encodeUint256(value: bigint): Uint8Array {
  return bigIntToBytes(assertUint256(value), 32);
}

/**
 * ABI-encodes a uint64 into a 32-byte ABI word while enforcing uint64 bounds.
 */
export function encodeUint64(value: bigint): Uint8Array {
  return bigIntToBytes(assertUint64(value), 32);
}

/**
 * Converts UTF-8 text to bytes.
 */
export function utf8ToBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

/**
 * Converts a hex string to bytes.
 */
export function hexToBytes(value: Hex): Uint8Array {
  const normalized = assertHex(value);
  const bytes = new Uint8Array((normalized.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(2 + index * 2, 4 + index * 2), 16);
  }
  return bytes;
}

/**
 * Converts bytes to a 0x-prefixed lower-case hex string.
 */
export function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Concatenates byte arrays without mutating the inputs.
 */
export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Interprets big-endian bytes as a bigint.
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(bytesToHex(bytes));
}

/**
 * Converts a bigint to a fixed-width big-endian byte array.
 */
export function bigIntToBytes(value: bigint, byteLength: number): Uint8Array {
  const hex = value.toString(16).padStart(byteLength * 2, "0");
  return hexToBytes(`0x${hex}` as Hex);
}

/**
 * Interprets little-endian bytes as a bigint for Keccak lane state.
 */
export function bytesToLittleEndianBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let index = 0; index < bytes.length; index += 1) {
    result |= BigInt(bytes[index]) << BigInt(index * 8);
  }
  return result;
}

/**
 * Converts a Keccak lane bigint to eight little-endian bytes.
 */
export function littleEndianBigIntToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number((value >> BigInt(index * 8)) & 0xffn);
  }
  return bytes;
}
