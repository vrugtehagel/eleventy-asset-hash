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

## About the codebase

In theory, asset hashing is relatively simple. A hash is constructed from each
file's contents, and references to said files are modified to get a query
parameter. This causes the browser to use cached versions of files when they
didn't change, and to download the new version when the hash changed.

While this concept sounds simple, it can get a little complex. For one, we can't
just first hash all the files and then add the query parameters, since adding
the query parameters to a file changes the hash. For example, if file A
references file B, and file B changes, then the naive method would not cause a
change in file A even though it needs to be re-requested simply because it has a
new reference to B.

In other words, to properly do asset hashing, we need to build a dependency tree
of sorts, and hash leaves until nothing is left. Unfortunately, there's another
issue; circular dependencies. If A depends on B and vice versa, then we can't
add the correct hash parameters because B's hash is included in A and vice
versa, meaning each hash is dependent on the other. To circumvent this issue, we
hash all files within circular dependencies once, replace the hashes inside
them, and then hash them again, replacing the hashes one last time. This ensures
that if one file in the loop changes, all of them get a new hash; and if none of
them changes, all the hashes remain the same.

So, in broad steps, here's what we do:

1. Index all files that need to be processed.
2. Identify the referenced assets within those files, marking their positions.
3. If files exist that only reference assets that are not also indexed files;
   add the hashes to these files, and remove them from the index. Repeat this
   until no more such files exist.
4. Hash all the remaining files as-is.
5. Replace the references to the assets/files with their hash.
6. Hash all the remaining files once more.
7. Replace the references to the assets/files with their new hash.

And that's it!
