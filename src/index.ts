import type { EleventyAssetHashOptions } from "./options.ts";
import { assetHash } from "./asset-hash.ts";

/** The type for the config object is not super relevant, but at least users
 * can understand what this type represents even if TypeScript doesn't. */
type EleventyConfig = any;

export function EleventyAssetHash(
  config: EleventyConfig,
  options: EleventyAssetHashOptions = {},
) {
  config.events.addListener("eleventy.after", async (event: any) => {
    const directory: string = event.dir.output;
    await assetHash({ directory, ...options });
  });
}
