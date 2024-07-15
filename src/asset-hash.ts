import fs from "node:fs/promises";
import type { EleventyAssetHashOptions } from "./options.ts";
import { PathResolver } from "./path-resolver.ts";
import { stringSplice } from "./string-splice.ts";

export async function assetHash(
  options: EleventyAssetHashOptions & { directory: string },
): Promise<void> {
  if (!("directory" in options)) {
    throw new Error(`The "directory" option must be specified.`);
  }
  if (options.directory.startsWith("/")) {
    throw new Error('The "directory" option must be relative to the CWD.');
  }

  const {
    directory,
    pathPrefix = "/",
    algorithm = "SHA-256",
    maxLength = Infinity,
    param = "v",
    computeChecksum: computer = async (content: ArrayBuffer): Promise<string> => {
      const buffer = await crypto.subtle.digest(algorithm, content);
      const uint8Array = new Uint8Array(buffer);
      return btoa(String.fromCharCode(...uint8Array));
    }
  } = options;

  /** Create a normalized `computeChecksum` that incorporates maxLength */
  const hasMaxLength = Number.isFinite(maxLength) && maxLength > 0;
  const computeChecksum = async (content: ArrayBuffer): Promise<string> => {
    const hash = await computer(content)
    if(!hasMaxLength) return hash;
    return hash.slice(0, maxLength)
  }

  /** This is going to help resolving asset paths that we find */
  const resolver = new PathResolver({
    directory,
    include: options.includeAssets ?? ["**/*.{css,js}"],
    exclude: options.excludeAssets,
    pathPrefix,
  });

  /** Before we start hashing, we create some handy-dandy functions to help
   * keep things brief and readable. */
  const hashCache = new Map<string, Promise<string | null>>();
  async function hashFile(path: string): Promise<string | null> {
    const cached = hashCache.get(path);
    if(cached) return await cached;
    const asyncResult = forceHashFile(path);
    hashCache.set(path, asyncResult);
    return await asyncResult;
  }
  function forgetHash(path: string): void {
    hashCache.delete(path);
  }
  async function forceHashFile(path: string): Promise<string | null> {
    const content = await fs.readFile(path).catch(() => null);
    if(!content) return null;
    return await computeChecksum(content);
  }

  /** Now onto the actual hashing! We'll go through the steps as outlined in
   * the README.
   * 1. Index all files that nned to be processed. */
  const filePaths = PathResolver.find({
    directory,
    include: options.include ?? ["**/*.html"],
    exclude: options.exclude,
  });

  /** 2. Identify the referenced assets within those files, marking their
   * positions. */
  type Reference = {
    text: string;
    path: string;
    endIndex: number;
    hasParams: boolean;
    hash?: string | null;
    naiveHash?: string | null;
    inserted?: number;
  }
  const referenceMap = new Map<string, Reference[]>();

  /** Valid URL path characters are [!$%(-;@-[\]_a-z~].
   * The entire regex matches assets in a string of content.
   * This does not match URLs including a domain, by design. */
  const pathRegex = new RegExp(
    "(?<=[^!$%(-;@-[\\]_a-z~])" + // must be preceded by non-URL character
      "\\.{0,2}/" + // then zero to two periods and a slash
      "[!$%(-;@-[\\]_a-z~]*" + // any number of URL characters
      "\\.\\w+" + // the file extension, minimum one character long
      "(?=[^!$%(-;@-[\\]_a-z~])", // followed by a non-URL character
    "g", // This is not part of the regex, it's just a flag
  );

  for(const filePath of filePaths){
    const content = await fs.readFile(filePath, { encoding: "utf8" });
    const matches = [...content.matchAll(pathRegex)];
    const references = []
    for(const match of matches){
      const text = match[0];
      const path = resolver.resolve(text, filePath);
      if(path == null) continue;
      const endIndex = match.index + text.length;
      const hasParams = content[endIndex] == "?";
      references.push({ text, path, endIndex, hasParams });
    }
    referenceMap.set(filePath, references);
  }

  /** 3. If files exist that only reference assets that are not also indexed
   * files; add the hashes to these files, and remove them from the index.
   * Repeat this until no more such files exist. */
  let previousSize: number;
  do {
    previousSize = referenceMap.size;
    await Promise.all([...referenceMap].map(async ([path, references]) => {
      const hasDependencies = references
        .some((reference) => referenceMap.has(reference.path))
      if (hasDependencies) return;
      const allHashing = []
      for(const reference of references){
        const promise = hashFile(reference.path);
        promise.then(hash => reference.hash = hash);
        allHashing.push(promise);
      }
      await Promise.all(allHashing);
      for(let index = references.length - 1; index >= 0; index--){
        const reference = references[index];
        if(reference.hash != null) continue;
        references.splice(index, 1);
      }
      if(references.length == 0){
        referenceMap.delete(path);
        return;
      }
      const content = await fs.readFile(path, { encoding: "utf8" });
      let transformed = content;
      let offset = 0;
      for(const reference of references){
        reference.endIndex += offset;
        const { endIndex, hasParams } = reference;
        const hash = reference.hash as string;
        transformed = hasParams
          ? stringSplice(transformed, endIndex + 1, 0, `${param}=${hash}&`)
          : stringSplice(transformed, endIndex, 0, `?${param}=${hash}`);
        offset += param.length + hash.length + 2;
      }
      await fs.writeFile(path, transformed);
      referenceMap.delete(path);
    }));
  } while(referenceMap.size < previousSize);

  /** Now that we've got all the "leaves" out of the way, the `referenceMap`
   * now only contains paths with dependencies that are also in said
   * `referenceMap`. In other words; we've only got circular dependencies
   * left. So, on to the next step:
   * 4. Hash all the remaining files as-is. */
  await Promise.all([...referenceMap].map(async ([path, references]) => {
    await Promise.all(references.map(async (reference) => {
      if(reference.hash) return;
      const hash = await hashFile(reference.path);
      if(referenceMap.has(reference.path)){
        reference.naiveHash = hash;
      } else {
        reference.hash = hash;
      }
    }));
  }));

  /** 5. Replace the references to the assets/files with their hash. */
  await Promise.all([...referenceMap].map(async ([path, references]) => {
    let offset = 0;
    const content = await fs.readFile(path, { encoding: "utf8" });
    let transformed = content;
    for(const reference of references){
      reference.endIndex += offset;
      const { hasParams, endIndex } = reference;
      const hash = reference.hash ?? reference.naiveHash as string;
      transformed = hasParams
        ? stringSplice(transformed, endIndex + 1, 0, `${param}=${hash}&`)
        : stringSplice(transformed, endIndex, 0, `?${param}=${hash}`);
      const inserted = param.length + hash.length + 2;
      reference.inserted = inserted;
      offset += inserted;
    }
    await fs.writeFile(path, transformed);
  }));

  /** 6. Hash all the remaining files once more. */
  await Promise.all([...referenceMap].map(async ([path, references]) => {
    await Promise.all(references.map(async (reference) => {
      if(reference.hash) return;
      forgetHash(reference.path);
      const hash = await hashFile(reference.path);
      // console.log(reference.path, hash, reference.naiveHash, reference);
      reference.naiveHash = hash;
    }));
  }));

  /** 7. Replace the references to the assets/files with their new hash. */
  await Promise.all([...referenceMap].map(async ([path, references]) => {
    let offset = 0;
    const content = await fs.readFile(path, { encoding: "utf8" });
    let transformed = content;
    for(const reference of references){
      reference.endIndex += offset;
      if(reference.hash != null) continue;
      const { hasParams, endIndex } = reference;
      const inserted = reference.inserted as number;
      const hash = reference.naiveHash as string;
      transformed = stringSplice(
        transformed,
        endIndex + 1,
        inserted - 1,
        `${param}=${hash}`
      );
      offset += param.length + hash.length + 2 - inserted;
    }
    await fs.writeFile(path, transformed);
  }));
}
