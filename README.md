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
import EleventyAssetHash from "@vrugtehagel/eleventy-asset-hash";

export default function (eleventyConfig) {
  // …
  eleventyConfig.addPlugin(EleventyAssetHash, {
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
- `onMissing`: A missing asset is one that is matched by `includeAssets`, not
  excluded by `excludeAssets` and referenced by a processed entry file, but not
  found in the file system. This option determines what should happen when such
  a file is found; set to either `"ignore"` to ignore missing assets, `"warn"`
  to log a warning and continue, or `"error"` to throw an error, halting the
  asset hashing before ever writing to the file system. By default, it is set to
  `"warn"`.

## About the codebase

At first glance, I thought asset hashing would be simple. Just hash the files,
add a query parameter to references to said files, and done. Easy, right? Nope!

First of all, the strategy of hashing first and then replacing hashes doesn't
work, because modifying the files by adding query parameters also changes their
hash. For example, if A depends on B, and B depends on C, then A indirectly also
depends on C. Specifically if C's hash changes, then the reference to C in B
changes, which causes B's hash to change, which in turn changes A's as well. If
we hash first, and then add the query parameters, then A never notices any
changes in C, and requests an old, incorrect version of B, which includes C's
old hash. No bueno!

The second issue is circular dependencies. We could have dependency loops of any
given length, and we can't really just hash one first because it would (could)
come with the same issue described above. Instead, we can hash dependency loops
as a whole; if any of the files in a loop changes, then all other files in the
loop need to get an updated hash anyway. But we need to be a little careful; if
A depends on B, B on C, and C on B, then we must first hash B and C together,
and only then handle A (even if A is also part of another dependency loop). This
is because B and C would not depend on A whatsoever, and so including A in their
hash would cause too many files to be invalidated.

Now, on to turning all this blabbering into a single generic (ideally
performant) algorithm.

- **Step 1.** Create an index of all files to process.
- **Step 2.** Scan each file, creating a list of each asset referenced and their
  position.
- **Step 3.** Using the references, find a smallest loop of (potentially just
  one) indexed dependencies and hash them together. After hashing, remove them
  (or it) from the index.
- **Step 4.** Repeat step 3 until the index is empty.

And that's it!
