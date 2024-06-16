import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS: EleventyAssetHashOptions = {
  algorithm: "SHA-256",
  maxLength: Infinity,
  param: "v",
  processExtensions: ["html", "css", "js"],
  hashedExtensions: ["css", "js"],
};

/** The Eleventy config object, should be a better type than "any" but alas */
type EleventyConfig = any;
/** Checksums are a shortish clash-tolerant string representing a file's contents */
type Checksum = string;
/** Any asset path, relative to the file it's in or absolute (starting with /) */
type AssetPath = string;
/** Asset paths, relative to the Eleventy config file */
type FullAssetPath = string;
/**
 * End index of a found asset path in the original source file.
 * This essentially indicates where to insert the query parameter.
 */
type EndIndex = number;

type EleventyAssetHashOptions = {
  /**
   * An algorithm to hash with. Must be supported by crypto.subtle.digest().
   * This option is ignored if a custom `computeChecksum` function is provided.
   */
  algorithm: string;
  /**
   * Maximum length of the checksum, for shorter (but less clash-resistant) hashes.
   * This option is ignored if a custom `computeChecksum` function is provided.
   */
  maxLength: number;
  /** Extensions of the files to transform URLs in. */
  processExtensions: string[];
  /** The name of the query param to use */
  param: string;
  /** The extensions for the files to hash */
  hashedExtensions: string[];
  /**
   * A path to resolve absolute URLs to. Defaults to Elevent output dir.
   * Ignored if a custom `resolvePath` function is given.
   */
  rootDir?: string;
  /**
   * Custom checksum function, mapping a file path to a checksum.
   * Return null if the file should not be hashed (or does not exist)
   */
  computeChecksum?: (path: FullAssetPath) => Promise<Checksum | null>;
  /**
   * Custom function to map a found asset path to a full path.
   * The full path must be relative to the project root.
   */
  resolvePath?: (path: AssetPath, page: any) => FullAssetPath;
};

/**
 * Creates a `computeChecksum` function given an algorithm.
 * Not used if the `computeChecksum` option is provided.
 */
function createChecksumComputer(
  algorithm: string,
  maxLength: number,
): (assetPath: FullAssetPath) => Checksum | null {
  const syncCache = new Map<FullAssetPath, Checksum | null>();
  const asyncCache = new Map<FullAssetPath, Promise<Checksum | null>>();
  const computeChecksum = async (
    assetPath: FullAssetPath,
  ): Promise<Checksum | null> => {
    const body = await fs.readFile(assetPath).catch(() => null);
    if (body == null) return null;
    const buffer = crypto.subtle.digest(algorithm, body);
    const uint8Array = new Uint8Array(buffer);
    const rawChecksum = String.fromCharCode(...uint8Array);
    const checksum = btoa(rawChecksum);
    if (!Number.isFinite(maxLength)) return checksum;
    return checksum.slice(0, maxLength);
  };
  return async (assetPath: FullAssetPath): Promise<Checksum | null> => {
    if (syncCache.has(assetPath)) return syncCache.get(assetPath);
    if (asyncCache.has(assetPath)) return await asyncCache.get(assetPath);
    const promise = computeChecksum(assetPath);
    asyncCache.set(assetPath, promise);
    const checksum = await promise;
    syncCache.set(assetPath, checksum);
    asyncCache.delete(assetPath);
    return checksum;
  };
}

/** Insert a string at a certain position into another string */
function insertAt(target: string, inserted: string, index: number): string {
  return target.slice(0, index) + inserted + target.slice(index);
}

/** The plugin itself, with an optional options object as second argument. */
export default function EleventyAssetHash(
  config: EleventyConfig,
  options: Partial<EleventyAssetHashOptions> = {},
) {
  const normalizedOptions = Object.assign({}, DEFAULTS, options);
  if (!normalizedOptions.processExtensions.every((ext) => ext in PROCESSORS)) {
    throw new Error(`Unprocessable extension "${ext}" specified.`);
  }
  const computeChecksum = normalizedOptions.computeChecksum ??
    createChecksumComputer(
      normalizedOptions.algorithm,
      normalizedOptions.maxLength,
    );

  /** Map an AssetPath to its FullAssetPath (relative to project root) */
  const rootDir = normalizedOptions.rootDir ?? config.dir.output;
  function defaultResolvePath(
    assetPath: AssetPath,
    page: any,
  ): FullAssetPath {
    const isAbsolute = assetPath.startsWith("/");
    if (isAbsolute) return path.resolve(rootDir, `.${assetPath}`);
    return path.resolve(path.dirname(page.outputDir), assetPath);
  }
  const resolvePath = normalizedOptions.resolvePath ?? defaultResolvePath;
  const invalidHashedExtension = normalizedOptions.hashedExtensions
    .find((extension) => /\W/.test(extension));
  if (invalidHashedExtension != null) {
    throw new Error(`Cannot match extension "${invalidHashedExtension}"`);
  }
  const urlChars = `[-.\\w~:/?#[\\]@!$&'()*+,;%=]*`;
  const extensionRefex = `(?:${normalizedOptions.hashedExtensions.join("|")})`;
  const assetPathRegex = new RegExp(
    `\\.{0,2}(?<!\w)\\/${urlChars}\\.${extensionRefex})`,
    "g",
  );

  /**
   * The transform responsible for looping through the content.
   * It finds asset paths and adds the matching checksums.
   */
  config.addTransform(
    "eleventy-asset-hash",
    async function (this: any, content: string): string {
      const outputPath = this.page.outputPath as string;
      if (!outputPath) return content;
      const outputExtension = this.page.outputFileExtension as string;
      if (!outputPath.endsWith(`.${outputExtension}`)) return content;
      const assetPathMatches = [...content.matchAll(assetPathRegex)]
        .map((match) => [match[0], match.index + match[0].length]);
      if (matches.length == 0) return content;
      const promises = assetPathMatches.map(async ([match, endIndex]) => [
        endIndex,
        await computeChecksum(resolvePath(match)),
      ]);
      // Flip it so we can loop-and-replace without messing up end indexes
      const insertions = await Promise.all(promises.reverse());
      let result = content;
      for (const [endIndex, checksum] of insertions) {
        const hasQueryParams = results[endIndex + 1] == "?";
        const param = `${normalizedOptions.param}=${checksum}`;
        if (hasQueryParams) {
          result = insertAt(result, `${param}&`, indexIndex + 1);
        } else {
          result = insertAt(result, param, endIndex);
        }
      }
      return result;
    },
  );
}
