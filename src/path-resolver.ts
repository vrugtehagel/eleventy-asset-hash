import nodePath from "node:path";
import fastGlob from "npm:fast-glob@^3.3.2";

/** This class has only a static `.find()` method that lists file paths, and a
 * `.resolve()` method that resolves a given asset path against the path of the
 * file it was found in. */
export class PathResolver {
  #directory: string = "";
  #pathPrefix: string = "";
  #files: string[];

  /** Normalize a directory, i.e. make sure it ends in a slash and optionally
   * make it start with ./ */
  static #normalize(
    directory: string,
    { relative }: { relative?: boolean } = {},
  ): string {
    const normalized = directory.replace(/\/?$/, "/");
    if (!relative) return normalized;
    return this.#relativize(normalized);
  }

  /** Turn an absolute path into a relative one, assuming the "root" of an
   * absolute path is CWD. For example, /foo/ just becomes ./foo/ */
  static #relativize(path: string): string {
    return path.replace(/^\/?/, "./");
  }

  /** List files in a directory, relative to CWD */
  static find(
    { directory, include = ["**"], exclude }: {
      directory: string;
      include?: string[];
      exclude?: string[];
    },
  ): string[] {
    const globs = include.map((path) => PathResolver.#relativize(path));
    const ignore = exclude?.map((path) => PathResolver.#relativize(path));
    const cwd = PathResolver.#normalize(directory, { relative: true });
    const paths = fastGlob.sync(globs, { cwd, ignore, dot: true });
    return paths.map((path) => nodePath.join(directory, path));
  }

  /** An instance can resolve single path files to a directory, using the
   * pathPrefix option. It's more efficient to instantiate this than making
   * a pure function because we can avoid having to resolve every single path
   * against lists of globs; instead, we just find the paths matched by the
   * globs, and keep that list in memory to compare paths to later. */
  constructor(
    { directory, include = ["**"], exclude, pathPrefix = "" }: {
      directory: string;
      include?: string[];
      exclude?: string[];
      pathPrefix: string;
    },
  ) {
    this.#directory = PathResolver.#normalize(directory, { relative: true });
    this.#pathPrefix = PathResolver.#normalize(pathPrefix);
    this.#files = PathResolver.find({ directory, include, exclude });
  }

  /** The only method of a PathResolver instance, resolves an asset path that
   * is found in a file, relative to the path of that file.
   * It can return `null` if the asset is not matched by the globs. */
  resolve(path: string, relativeTo: string): string | null {
    const result = this.#resolveAny(path, relativeTo);
    if (result == null) return null;
    if (!this.#files.includes(result)) return null;
    return result;
  }

  /** The same as `.resolve()`, except it doesn't care about the globs */
  #resolveAny(path: string, relativeTo: string): string | null {
    if (path.startsWith("/")) return this.#resolveAbsolute(path);
    if (!path.startsWith(".")) return null;
    return this.#resolveRelative(path, relativeTo);
  }

  /** Resolves absolute paths using the `pathPrefix`. */
  #resolveAbsolute(path: string): string | null {
    if (!path.startsWith(this.#pathPrefix)) return null;
    const root = this.#directory;
    return nodePath.join(root, `/${path.replace(this.#pathPrefix, "")}`);
  }

  /** Resolves relative paths against the path of the file they were found
   * in */
  #resolveRelative(path: string, relativeTo: string): string {
    const dir = nodePath.dirname(relativeTo);
    return nodePath.join(dir, path);
  }
}
