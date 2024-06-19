# eleventy-asset-hash

Adds a hash query parameter to URLs in Eleventy projects (or even outside of
Eleventy projects).

## Installation

To install, run any of the following commands:

```bash
# For npm:
npx jsr add @vrugtehagel/eleventy-asset-hash
# For yarn:
yarn dlx jsr add @vrugtehagel/eleventy-asset-hash
# For pnpm:
pnpm dlx jsr add @vrugtehagel/eleventy-asset-hash
# For deno:
deno add @vrugtehagel/eleventy-asset-hash
```

## Config

In your Eleventy configuration file (usually `.eleventy.js`), import/require the
module and add the plugin using `.addPlugin()`:

```js
import EleventyDocumentOutline from "eleventy-document-outline";

export default function (eleventyConfig) {
  // …
  eleventyConfig.addPlugin(EleventyDocumentOutline, {
    algorithm: "SHA-256",
    include: ["**/*.html"],
    includeAssets: ["**/*.{css,js}"],
  });
  // …
}
```

As shown above, there are additional options one may pass as second argument to
the `.addPlugin()` call, as an object. It may have the following keys:

- `algorithm`: A hashing algorithm, as supported by the standardized
  `crypto.subtle.digest()`, such as `'SHA-1'`, `'SHA-256'`, `'SHA-384'`, or
  `'SHA-512'`. Defaults to `'SHA-256'`. For other algorithms, see the
  `computeChecksum` option.
- `maxLength`: An optional maximum length for the hash. If the hash exceeds this
  lengths, it is trimmed to be `maxLength`. This exists mostly to reduce the
  impact of the added hash at the cost of some clash-resilience.
- `param`: The name of the query param to use; defaults to `'v'`.
- `directory`: The output directory to process files in. Defaults to `dir.ouput`
  as specified in your Eleventy config. This is simultaneously the directory
  that found assets are resolved against, though see `pathPrefix` to adjust
  this.
- `include`: An array of globs for the files to process. These globs are applied
  to the output directory (see the `directory` option), not the CWD.
- `exclude`: An array of globs for files not to process. Any files matched by
  this is ignored even if they are matched by the `include` option.
- `pathPrefix`: A prefix to cut off of absolute URLs. This is useful if your
  Eleventy output is uploaded to a site's subdirectory; for example, if your
  site is uploaded under `/foo/`, the setting `pathPrefix: '/foo/'` causes
  absolute URLs such as `/foo/bar.js` to look up `bar.js` (relative to the
  output directory).
- `includeAssets`: An array of globs for the assets to hash and add query
  parameters for. Note that assets are not hashed if they are not referenced by
  any of the files processed, since then there's nowhere to add the query
  parameter.
- `excludeAssets`: An array of globs for assets not to hash.
- `computeChecksum`: A custom function to compute checksums based on a file's
  contents. It must accept one argument, an `ArrayBuffer`, and return the
  checksum as a string.
