import type { Hex } from "./types";
import { bytesToHex, bytesToLittleEndianBigInt, littleEndianBigIntToBytes, utf8ToBytes } from "./hex";

const MASK_64 = (1n << 64n) - 1n;

const KECCAK_ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n
] as const;

const KECCAK_ROTATION_OFFSETS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14]
] as const;

/**
 * Hashes UTF-8 text with Ethereum's Keccak-256 variant.
 */
export function keccak256Utf8(value: string): Hex {
  return keccak256Hex(utf8ToBytes(value));
}

/**
 * Hashes bytes with Ethereum's Keccak-256 variant.
 */
export function keccak256Hex(bytes: Uint8Array): Hex {
  const rateInBytes = 136;
  const state = Array<bigint>(25).fill(0n);
  const padded = keccakPad(bytes, rateInBytes);

  for (let offset = 0; offset < padded.length; offset += rateInBytes) {
    for (let lane = 0; lane < rateInBytes / 8; lane += 1) {
      state[lane] = (state[lane] ^ bytesToLittleEndianBigInt(padded.slice(offset + lane * 8, offset + lane * 8 + 8))) & MASK_64;
    }
    keccakF1600(state);
  }

  const output = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane += 1) {
    output.set(littleEndianBigIntToBytes(state[lane]), lane * 8);
  }
  return bytesToHex(output);
}

function keccakPad(bytes: Uint8Array, rateInBytes: number): Uint8Array {
  const paddedLength = Math.ceil((bytes.length + 1) / rateInBytes) * rateInBytes;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  return padded;
}

function keccakF1600(state: bigint[]): void {
  for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
    const columnParity = Array<bigint>(5).fill(0n);
    const theta = Array<bigint>(5).fill(0n);

    for (let x = 0; x < 5; x += 1) {
      columnParity[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      theta[x] = columnParity[(x + 4) % 5] ^ rotateLeft64(columnParity[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (state[x + 5 * y] ^ theta[x]) & MASK_64;
      }
    }

    const rhoPi = Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        rhoPi[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft64(state[x + 5 * y], KECCAK_ROTATION_OFFSETS[x][y]);
      }
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (rhoPi[x + 5 * y] ^ (~rhoPi[((x + 1) % 5) + 5 * y] & rhoPi[((x + 2) % 5) + 5 * y])) & MASK_64;
      }
    }
    state[0] = (state[0] ^ roundConstant) & MASK_64;
  }
}

function rotateLeft64(value: bigint, shift: number): bigint {
  if (shift === 0) {
    return value & MASK_64;
  }
  return ((value << BigInt(shift)) | (value >> BigInt(64 - shift))) & MASK_64;
}
