/** An options object. Every option is optional. */
export type EleventyAssetHashOptions = {
  /** The directory to search in. Defaults to `dir.output` as specified in your
   * Eleventy config. */
  directory?: string;

  /** A prefix to resolve absolute URLs against. For example, if a reference to
   * /foo/bar.js is found, by default this is considered to be relative to the
   * `directory` option. However, if the build output is uploaded to be inside
   * example.com/foo/, then the asset needs to be looked up as just /bar.js
   * since the /foo/ folder doesn't exist in the build output. In that case,
   * you'd want to specify `pathPrefix: '/foo/'`. Defaults to the `pathPrefix`
   * specified in your Eleventy config. */
  pathPrefix?: string;

  /** Files to process. Defaults to processing only HTML files in the output
   * directory. */
  include?: string[];

  /** Files to exclude from processing. These files are not processed even if
   * they are specified in the `include` option.
   * By default, processes HTML files only. */
  exclude?: string[];

  /** Assets to compute checksums for. Defaults to processing only styles and
   * scripts, i.e. files with `.css` or `.js` extensions. */
  includeAssets?: string[];

  /** Assets not to compute checksums for. These are not looked at even if they
   * are specified in the `includeAssets` option.
   * By default, excludes nothing. */
  excludeAssets?: string[];

  /** The hashing algorithm to use. Ignored if a custom `computeChecksum`
   * option is given. Must be a type supported by `crypto.subtle.digest()`. */
  algorithm?: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

  /** A length to limit the hashes to, to avoid excessively long query
   * parameters. Note that trimmed hashes are less clash-resistant. */
  maxLength?: number;

  /** The name for the query param to use. Defaults to `'v'` */
  param?: string;

  /** A custom function to compute checksums. */
  computeChecksum?: (content: ArrayBuffer) => Promise<string>;

  /** Determines what should happen when an asset is referenced that is matched
   * by `includeAssets` and not by `excludeAssets`, but is not found in  the
   * filesystem. `"ignore"` does nothing, `"warn"` logs a warning (but continues
   * hasing) and `"error"` throws an error and halts the hashing process
   * altogether. Defaults to `"warn"`. */
  onMissing?: "ignore" | "warn" | "error";
};
