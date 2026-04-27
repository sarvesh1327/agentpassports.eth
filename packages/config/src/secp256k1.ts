import type { Hex } from "./types";
import { assertHex, bigIntToBytes, bytesToBigInt, concatBytes, hexToBytes, normalizeBytes32 } from "./hex";
import { keccak256Hex, keccak256Utf8 } from "./keccak";

type EcPoint = {
  x: bigint;
  y: bigint;
} | null;

const SECP256K1_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_N = SECP256K1_N / 2n;
const SECP256K1_G = {
  x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
} as const;

/**
 * Recovers the Ethereum address that signed a raw 32-byte digest.
 */
export function recoverSignerAddress(digest: Hex, signature: Hex): Hex {
  const digestBytes = hexToBytes(normalizeBytes32(digest));
  const signatureBytes = hexToBytes(assertHex(signature, 65));
  const r = bytesToBigInt(signatureBytes.slice(0, 32));
  const s = bytesToBigInt(signatureBytes.slice(32, 64));
  let v = signatureBytes[64];
  if (v < 27) {
    v += 27;
  }
  const recoveryId = v - 27;
  if (v !== 27 && v !== 28) {
    throw new Error("Invalid ECDSA signature");
  }
  if (r <= 0n || r >= SECP256K1_N || s <= 0n || s > SECP256K1_HALF_N) {
    throw new Error("Invalid ECDSA signature");
  }

  const x = r + BigInt(Math.floor(recoveryId / 2)) * SECP256K1_N;
  if (x >= SECP256K1_P) {
    throw new Error("Invalid ECDSA signature");
  }

  const recoveredPoint = recoverPublicKey(bytesToBigInt(digestBytes), r, s, recoveryId);
  if (recoveredPoint === null) {
    throw new Error("Invalid ECDSA signature");
  }

  const publicKey = concatBytes(bigIntToBytes(recoveredPoint.x, 32), bigIntToBytes(recoveredPoint.y, 32));
  return checksumAddress(`0x${keccak256Hex(publicKey).slice(-40)}`);
}

function recoverPublicKey(digest: bigint, r: bigint, s: bigint, recoveryId: number): EcPoint {
  const x = r + BigInt(Math.floor(recoveryId / 2)) * SECP256K1_N;
  const y = recoverY(x, recoveryId % 2);
  const rPoint = { x, y };
  const rInverse = modularInverse(r, SECP256K1_N);
  const sR = pointMultiply(rPoint, s);
  const eG = pointMultiply(SECP256K1_G, digest % SECP256K1_N);
  return pointMultiply(pointAdd(sR, pointNegate(eG)), rInverse);
}

function recoverY(x: bigint, parity: number): bigint {
  const ySquared = mod(x ** 3n + 7n, SECP256K1_P);
  let y = modularPow(ySquared, (SECP256K1_P + 1n) / 4n, SECP256K1_P);
  // Non-residue x values do not map to secp256k1 points and must match onchain ECDSA rejection.
  if (mod(y * y, SECP256K1_P) !== ySquared) {
    throw new Error("Invalid ECDSA signature");
  }
  if (Number(y & 1n) !== parity) {
    y = SECP256K1_P - y;
  }
  return y;
}

function pointAdd(left: EcPoint, right: EcPoint): EcPoint {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  if (left.x === right.x && mod(left.y + right.y, SECP256K1_P) === 0n) {
    return null;
  }

  const slope =
    left.x === right.x && left.y === right.y
      ? mod(3n * left.x * left.x * modularInverse(2n * left.y, SECP256K1_P), SECP256K1_P)
      : mod((right.y - left.y) * modularInverse(right.x - left.x, SECP256K1_P), SECP256K1_P);
  const x = mod(slope * slope - left.x - right.x, SECP256K1_P);
  const y = mod(slope * (left.x - x) - left.y, SECP256K1_P);
  return { x, y };
}

function pointNegate(point: EcPoint): EcPoint {
  if (point === null) {
    return null;
  }
  return { x: point.x, y: mod(-point.y, SECP256K1_P) };
}

function pointMultiply(point: EcPoint, scalar: bigint): EcPoint {
  let result: EcPoint = null;
  let addend = point;
  let remaining = scalar;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = pointAdd(result, addend);
    }
    addend = pointAdd(addend, addend);
    remaining >>= 1n;
  }
  return result;
}

function modularInverse(value: bigint, modulus: bigint): bigint {
  let low = mod(value, modulus);
  let high = modulus;
  let lowCoefficient = 1n;
  let highCoefficient = 0n;
  while (low > 1n) {
    const quotient = high / low;
    [low, high] = [high - quotient * low, low];
    [lowCoefficient, highCoefficient] = [highCoefficient - quotient * lowCoefficient, lowCoefficient];
  }
  return mod(lowCoefficient, modulus);
}

function modularPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let current = mod(base, modulus);
  let remaining = exponent;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = mod(result * current, modulus);
    }
    current = mod(current * current, modulus);
    remaining >>= 1n;
  }
  return result;
}

function mod(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result >= 0n ? result : result + modulus;
}

function checksumAddress(address: Hex): Hex {
  const lowerAddress = assertHex(address, 20).slice(2).toLowerCase();
  const hash = keccak256Utf8(lowerAddress).slice(2);
  let checksummed = "0x";
  for (let index = 0; index < lowerAddress.length; index += 1) {
    const character = lowerAddress[index];
    checksummed += Number.parseInt(hash[index], 16) >= 8 ? character.toUpperCase() : character;
  }
  return checksummed as Hex;
}
