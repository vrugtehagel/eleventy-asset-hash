/** Valid URL path characters are [!$%(-;@-[\]_a-z~].
 * The entire regex matches assets in a string of content.
 * This does not match URLs including a domain, by design. */
const regex = new RegExp(
  "(?<=[^!$%(-;@-[\\]_a-z~])" + // must be preceded by non-URL character
    "\\.{0,2}/" + // then zero to two periods and a slash
    "[!$%(-;@-[\\]_a-z~]*" + // any number of URL characters
    "\\.\\w+" + // the file extension, minimum one character long
    "(?=[^!$%(-;@-[\\]_a-z~])", // followed by a non-URL character
  "g", // This is not part of the regex, it's just a flag
);

/** Detects asset URLs in a file's contents. Returns the start index of the
 * match and the asset URL found at that index. */
export function detectAssets(content: string): Array<[number, string]> {
  const matches = [...content.matchAll(regex)];
  return matches.map((match) => [match.index, match[0]]);
}
