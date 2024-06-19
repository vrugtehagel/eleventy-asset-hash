import fs from "node:fs/promises";
import type { EleventyAssetHashOptions } from "./options.ts";
import { computeChecksum as defaultComputeChecksum } from "./compute-checksum.ts";
import { PathResolver } from "./path-resolver.ts";
import { detectAssets } from "./detect-assets.ts";

/** Hashes assets and appends query params in a certain directory.
 * This is not actually Eleventy-specific. */
export async function assetHash(
  options: EleventyAssetHashOptions & { directory: string },
): Promise<void> {
  if (!("directory" in options)) {
    throw new Error(`The "directory" option must be specified.`);
  }
  if (options.directory.startsWith("/")) {
    throw new Error('The "directory" option must be relative to the CWD.');
  }

  const {
    directory,
    pathPrefix = "/",
    algorithm = "SHA-256",
    maxLength = Infinity,
    param = "v",
    computeChecksum = (content) => defaultComputeChecksum(content, algorithm),
  } = options;

  /** This is going to help resolving asset paths that we find */
  const resolver = new PathResolver({
    directory,
    include: options.includeAssets ?? ["**/*.{css,js}"],
    exclude: options.excludeAssets,
    pathPrefix,
  });

  /** Gets a checksum from a file path. The path given must be relative to the
   * project root, i.e. already resolved against `directory` if needed.
   * It returns null for assets that don't exist. */
  getAssetChecksum.cache = new Map<string, string | null>();
  getAssetChecksum.asyncCache = new Map<string, Promise<string | null>>();
  async function getAssetChecksum(path: string): Promise<string | null> {
    const cached = getAssetChecksum.cache.get(path);
    if (cached != null) return cached;
    const asyncCached = getAssetChecksum.asyncCache.get(path);
    if (asyncCached != null) return asyncCached;
    const asyncResult = (async () => {
      const content = await fs.readFile(path).catch(() => null);
      if (content == null) return null;
      const checksum = await computeChecksum(content);
      if (!Number.isFinite(maxLength)) return checksum;
      if (maxLength < 0) return checksum;
      return checksum.slice(0, maxLength);
    })();
    getAssetChecksum.asyncCache.set(path, asyncResult);
    const checksum = await asyncResult;
    getAssetChecksum.cache.set(path, checksum);
    getAssetChecksum.asyncCache.delete(path);
    return checksum;
  }

  /** Insert a string into another at a certain index */
  function insertAt(
    target: string,
    insertion: string,
    index: number,
  ): string {
    return target.slice(0, index) + insertion + target.slice(index);
  }

  /** Match the files to process, then find the assets in each of them and
   * insert the query params back-to-front as to not mess with the indexes */
  const filePaths = PathResolver.find({
    directory,
    include: options.include ?? ["**/*.html"],
    exclude: options.exclude,
    pathPrefix,
  });

  await Promise.all(filePaths.map(async (filePath: string) => {
    const content = await fs.readFile(filePath, { encoding: "utf8" });
    const matches = detectAssets(content).reverse();
    if (matches.length == 0) return;
    let result = content;
    for (const [index, path] of matches) {
      const fullPath = resolver.resolve(path, filePath);
      if (fullPath == null) continue;
      const checksum = await getAssetChecksum(fullPath);
      if (checksum == null) continue;
      const endIndex = index + path.length;
      result = result[endIndex + 1] == "?"
        ? insertAt(result, `${param}=${checksum}&`, endIndex + 1)
        : insertAt(result, `?${param}=${checksum}`, endIndex);
    }
    if (content == result) return;
    await fs.writeFile(filePath, result);
  }));
}
