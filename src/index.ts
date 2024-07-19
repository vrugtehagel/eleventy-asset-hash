import type { EleventyAssetHashOptions } from "./options.ts";
import { assetHash } from "./asset-hash.ts";

/** The type for the config object is not super relevant, but at least users
 * can understand what this type represents even if TypeScript doesn't. */
type EleventyConfig = any;

/** The actual plugin itself. The actual hashing happens independently of
 * Eleventy, we just wait until Eleventy is done and then go over the output
 * directory to hash assets and add the query parameters.
 * Options are completely optional. */
export function EleventyAssetHash(
  config: EleventyConfig,
  options?: EleventyAssetHashOptions,
) {
  config.events.addListener("eleventy.after", async () => {
    const directory: string = config.dir.output;
    const pathPrefix: string = config.pathPrefix ?? "/";
    await assetHash({ directory, pathPrefix, ...options });
  });
}
