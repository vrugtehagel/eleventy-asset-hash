import fs from "node:fs/promises";
import nodePath from "node:path";
import fastGlob from "npm:fast-glob@^3.3.2";
import micromatch from "npm:micromatch@^4.0.5";

import type { EleventyAssetHashOptions } from "./options.ts";

/** Hashes assets and appends query params in a certain directory.
 * This is not actually Eleventy-specific. */
export async function assetHash(
  options: EleventyAssetHashOptions & { directory: string },
): Promise<void> {
  if (!("directory" in options)) {
    throw Error(`The "directory" option must be specified.`);
  }
  if (options.directory.startsWith("/")) {
    throw Error(`The "directory" option must be relative to the CWD.`);
  }
  if (options.pathPrefix && !options.pathPrefix.startsWith("/")) {
    throw Error(`The "pathPrefix" option must start with a forward slash.`);
  }
  if (options.pathPrefix && !options.pathPrefix.endsWith("/")) {
    throw Error(`The "pathPrefix" option must end in a forward slash.`);
  }

  /** Initialize default values. */
  const {
    directory,
    pathPrefix = "/",
    algorithm = "SHA-256",
    maxLength = Infinity,
    param = "v",
    include = ["**/*.html"],
    exclude = [],
    includeAssets = ["**/*.{css,js}"],
    excludeAssets = [],
    computeChecksum = async (content: ArrayBuffer): Promise<string> => {
      const buffer = await crypto.subtle.digest(algorithm, content);
      const uint8Array = new Uint8Array(buffer);
      return btoa(String.fromCharCode(...uint8Array));
    },
    onMissing = "warn",
  } = options;

  /** Create a functions that hashes files by content or path */
  const hasMaxLength = Number.isFinite(maxLength) && maxLength > 0;
  async function hashContents(buffer: ArrayBuffer): Promise<string | null> {
    const hash = await computeChecksum(buffer);
    if (!hasMaxLength) return hash;
    return hash.slice(0, maxLength);
  }
  async function hashFile(path: string): Promise<string | null> {
    const uint8Array = await fs.readFile(path).catch(() => null);
    if (!uint8Array) return null;
    const { buffer } = new Uint8Array(uint8Array);
    return await hashContents(buffer);
  }

  /** Create a function that hashes a file, but with cache to avoid work */
  const hashCache = new Map<string, Promise<string | null>>();
  async function hashFileWithCache(path: string): Promise<string | null> {
    const cached = hashCache.get(path);
    if (cached) return cached;
    hashCache.set(path, hashFile(path));
    return await hashFileWithCache(path);
  }

  /** Create a file index and an asset index. These are the files we will
   * process and those we will hash, respectively. */
  const forceDotSlash = (path: string): string => path.replace(/^\/?/, "./");
  const forceEndSlash = (path: string): string => path.replace(/\/?$/, "/");
  const cwd = forceEndSlash(forceDotSlash(directory));
  const forceCwd = (path: string): string => nodePath.join(cwd, path);
  const fileIndex: Set<string> = new Set(
    fastGlob.sync(
      include.map(forceDotSlash),
      { cwd, ignore: exclude.map(forceDotSlash), dot: true },
    ).map((path) => nodePath.join(directory, path)),
  );
  const assetIndex: Set<string> = new Set(
    fastGlob.sync(
      includeAssets.map(forceDotSlash),
      { cwd, ignore: excludeAssets.map(forceDotSlash), dot: true },
    ).map((path) => nodePath.join(directory, path)),
  );

  /** A helper to resolve asset paths we find within indexed files. It returns
   * `null` when it cannot resolve the path to an existing asset. */
  const missing = new Set<string>();
  const fullIncluded = includeAssets.map(forceCwd);
  const fullExcluded = excludeAssets.map(forceCwd);
  function resolve(assetPath: string, path: string): string | null {
    const isAbsolute = assetPath.startsWith(pathPrefix);
    const isRelative = assetPath.startsWith(".");
    if (!isAbsolute && !isRelative) return null;
    const resultingPath = isAbsolute
      ? nodePath.join(cwd, `/${assetPath.replace(pathPrefix, "")}`)
      : nodePath.join(nodePath.dirname(path), assetPath);
    if (assetIndex.has(resultingPath)) return resultingPath;
    if (onMissing == "ignore") return null;
    if (missing.has(resultingPath)) return null;
    missing.add(resultingPath);
    const isIncluded = micromatch.isMatch(
      resultingPath,
      fullIncluded,
      { ignore: fullExcluded },
    );
    if (!isIncluded) return null;
    const message = `Missing asset "${resultingPath}" ` +
      `(referenced in "${path}")`;
    if (onMissing == "error") {
      throw Error(message);
    } else {
      console.warn(`Warning: ${message}`);
    }
    return null;
  }

  /** This is the regex used to scan for asset URLs (or at least, strings that
   * look like it). Note that it's generally okay for this to match more than
   * just the assets, because we'll still just ignore them if we can't resolve
   * them to an existing asset path. */
  const pathRegex = new RegExp(
    "(?<=[^!$%(-;@-[\\]_a-z~])" +
      "\\.{0,2}/" +
      "(?!/)" +
      "[!$%(-;@-[\\]_a-z~]*" +
      "\\.\\w+" +
      "(?=[^!$%(-;@-[\\]_a-z~])",
    "g",
  );

  /** It's time to build our referenceMap. This maps each indexed file path to
   * the assets that it references. We simultaneously prepare the dependencyMap,
   * which we'll use to find our "smallest dependency loops" later on. We only
   * count something as a "dependency" if that asset is also one of our indexed
   * files. */
  type Reference = { path: string; endIndex: number; hasParams: boolean };
  const referenceMap = new Map<string, Reference[]>();
  const dependencyMap = new Map<string, Set<string>>();
  for (const path of fileIndex) {
    const content = await fs.readFile(path, "utf8");
    const references = [];
    const dependencies = new Set<string>([path]);
    for (const match of content.matchAll(pathRegex)) {
      const text = match[0];
      const assetPath = resolve(match[0], path);
      if (assetPath == null) continue;
      const endIndex = match.index + text.length;
      const hasParams = content[endIndex] == "?";
      references.push({ path: assetPath, endIndex, hasParams });
      if (fileIndex.has(assetPath)) dependencies.add(assetPath);
    }
    referenceMap.set(path, references);
    dependencyMap.set(path, dependencies);
  }

  /** A function that inserts query parameters based on the references. */
  async function insertQueryParams(
    content: string,
    references?: Reference[],
    skip?: Set<string>,
  ): Promise<string> {
    if (!references) return content;
    let transformed = content;
    let offset = 0;
    for (let index = 0; index < references.length; index++) {
      const reference = references[index];
      reference.endIndex += offset;
      if (skip?.has(reference.path)) continue;
      const { path, endIndex, hasParams } = reference;
      const hash = await hashFileWithCache(path);
      references.splice(index, 1);
      index--;
      if (hash == null) continue;
      const insertion = hasParams ? `${param}=${hash}&` : `?${param}=${hash}`;
      const insertionIndex = hasParams ? endIndex + 1 : endIndex;
      transformed = transformed.slice(0, insertionIndex) +
        insertion +
        transformed.slice(insertionIndex);
      offset += param.length + hash.length + 2;
    }
    return transformed;
  }

  /** When we find a "smallest dependency loop", we need to hash its non-indexed
   * assets, insert the query parameters, and then hash the files from the loop
   * altogether. */
  const encoder = new TextEncoder();
  async function processLoop(dependencies: Set<string>): Promise<void> {
    const sortedDependencies = [...dependencies].sort();
    const contents = await Promise.all(sortedDependencies.map(
      async (dependency: string): Promise<string> => {
        const references = referenceMap.get(dependency);
        const content = await fs.readFile(dependency, "utf8");
        return await insertQueryParams(content, references, dependencies);
      },
    ));
    const combined = contents.join("");
    const uint8Array = new Uint8Array();
    encoder.encodeInto(combined, uint8Array);
    const hash = await hashContents(uint8Array.buffer);
    for (const dependency of dependencies) {
      hashCache.set(dependency, Promise.resolve(hash));
    }
    for (const [index, dependency] of sortedDependencies.entries()) {
      const content = contents[index];
      const references = referenceMap.get(dependency);
      const transformed = await insertQueryParams(content, references);
      await fs.writeFile(dependency, transformed);
    }
  }

  /** To find our "smallest dependency loop" and hash it, we first identify
   * which of the sets of dependencies is the smallest. Then, we try to expand
   * it, and if it doesn't change size, we know it is complete and ready to go.
   * If it does change size, then we go back to finding the smallest and try
   * again. After processing a loop, we remove all files in the loop from the
   * index, dependencyMap, and the referenceMap. */
  while (fileIndex.size > 0) {
    let smallestFile: string | undefined;
    let smallestLoop: Set<string> | undefined;
    for (const [path, dependencies] of dependencyMap) {
      if (smallestLoop && dependencies.size >= smallestLoop.size) continue;
      smallestFile = path;
      smallestLoop = dependencies;
      if (smallestLoop.size == 1) break;
    }
    if (smallestFile == undefined || smallestLoop == undefined) break;
    const size = smallestLoop.size;
    for (const dependency of smallestLoop) {
      const subDependencies = dependencyMap.get(dependency);
      if (!subDependencies) continue;
      for (const subDependency of subDependencies) {
        smallestLoop.add(subDependency);
      }
    }
    if (smallestLoop.size > size) continue;
    await processLoop(smallestLoop);
    smallestLoop.add(smallestFile);
    for (const dependency of smallestLoop) {
      referenceMap.delete(dependency);
      fileIndex.delete(dependency);
      dependencyMap.delete(dependency);
      for (const dependencies of dependencyMap.values()) {
        dependencies.delete(dependency);
      }
    }
  }
}
