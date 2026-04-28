import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ServerEnv = Record<string, string | undefined>;

/**
 * Reads root and app-local dotenv files for server-only values during local Next.js execution.
 */
export function readLocalServerFallbackEnv(cwd = process.cwd()): ServerEnv {
  return mergeNonEmptyEnv(
    readDotenvFile(path.resolve(cwd, "../../.env")),
    readDotenvFile(path.resolve(cwd, ".env"))
  );
}

/**
 * Merges fallback dotenv values with the live process env, letting process env win.
 */
export function readMergedServerEnv(
  env: ServerEnv = process.env,
  fallbackEnv: ServerEnv = env === process.env ? readLocalServerFallbackEnv() : {}
): ServerEnv {
  return mergeNonEmptyEnv(fallbackEnv, env);
}

/**
 * Parses a dotenv file when it exists and returns an empty object otherwise.
 */
export function readDotenvFile(filePath: string): ServerEnv {
  if (!existsSync(filePath)) {
    return {};
  }

  return parseDotenvText(readFileSync(filePath, "utf8"));
}

/**
 * Parses simple KEY=value dotenv lines without expanding shell expressions.
 */
export function parseDotenvText(text: string): ServerEnv {
  const env: ServerEnv = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const value = match[2].replace(/^['"]|['"]$/g, "").trim();
    if (value) {
      env[match[1]] = value;
    }
  }

  return env;
}

/**
 * Copies only non-empty values, with later sources overriding earlier sources.
 */
export function mergeNonEmptyEnv(...sources: ServerEnv[]): ServerEnv {
  const merged: ServerEnv = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      const normalizedValue = value?.trim();
      if (normalizedValue) {
        merged[key] = normalizedValue;
      }
    }
  }

  return merged;
}
