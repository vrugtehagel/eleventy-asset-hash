# eleventy-asset-hash

Adds a hash query parameter to URLs in Eleventy projects

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

In your Eleventy configuration file (usually `.eleventy.js`), import/require the module and add the plugin using `.addPlugin()`:

```js
import EleventyDocumentOutline from "eleventy-document-outline";

export default function (eleventyConfig) {
  // …
  eleventyConfig.addPlugin(EleventyDocumentOutline, {
    algorithm: "SHA-256",
    processedExtensions: ['html', 'css', 'js'],
    hashedExtensions: ['css', 'js'],
  });
  // …
}
```

As shown above, there are additional options one may pass as second argument to the `.addPlugin()` call, as an object. It may have the following keys:

- `algorithm`: a hashing algorithm. Must be supported by `crypto.subtle.digest()`, such as `'SHA-1'`, `'SHA-256'`, `'SHA-384'`, or `'SHA-512'`. Defaults to `'SHA-256'`.
- `maxLength`: an optional maximum length for the hash. If the hash exceeds this lengths, it is trimmed to be `maxLength`. This exists mostly to reduce the impact of the added hash at the cost of some clash-resilience.
- `processExtensions`: the extensions of the output files to process. Defaults to `['html']`. If an extension is not processed by default (e.g. when using `.addPassthroughCopy()` to copy CSS files), then the extension is automatically added. If this is undersired, use:
- `disableAutomaticExtensionProcessing`: a boolean to disable the automatic processing of extensions that are found in `processExtensions` but are not detected as output extensions. Defaults to `false`.
- `param`: the query parameter name to use for the hash. Defaults to `'v'`.
- `hashedExtensions`: the extensions of the files to hash and add the query param to. Defaults to `['css', 'js']`.
- `rootDir`: the root directory to match absolute URLs against. References to assets found are looked up under that path using `rootDir` as base, then read and hashed. Defaults to the `dir.ouput` option passed to Eleventy.
- `computeChecksum`: optionally, a custom checksum function. Receives a full asset path relative to the project root. It may return a string (a hash) or `null` if it must not be processed.
- `resolvePath`: a custom path resolver function. Receives a matched asset path (either relative to the file it's found in, or absolute) and a second `page` argument that has data about the page the given asset was found in.
