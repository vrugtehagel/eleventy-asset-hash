import nodePath from "node:path";
import fastGlob from "npm:fast-glob@^3.3.2";

export class PathResolver {
  #directory: string = "";
  #pathPrefix: string = "";
  #files: string[];

  static normalize(
    directory: string,
    { relative }: { relative?: boolean } = {},
  ): string {
    const normalized = directory.replace(/\/?$/, "/");
    if (!relative) return normalized;
    return this.relativize(normalized);
  }

  static relativize(path: string): string {
    return path.replace(/^\/?/, "./");
  }

  static find(
    { directory, include = ["**"], exclude }: {
      directory: string;
      include?: string[];
      exclude?: string[];
    },
  ): string[] {
    const globs = include.map((path) => PathResolver.relativize(path));
    const ignore = exclude?.map((path) => PathResolver.relativize(path));
    const cwd = PathResolver.normalize(directory, { relative: true });
    const paths = fastGlob.sync(globs, { cwd, ignore, dot: true });
    return paths.map((path) => nodePath.join(directory, path));
  }

  constructor(
    { directory, include = ["**"], exclude, pathPrefix = "" }: {
      directory: string;
      include?: string[];
      exclude?: string[];
      pathPrefix: string;
    },
  ) {
    this.#directory = PathResolver.normalize(directory, { relative: true });
    this.#pathPrefix = PathResolver.normalize(pathPrefix);
    this.#files = PathResolver.find({ directory, include, exclude });
  }

  resolve(path: string, relativeTo: string): string | null {
    const result = this.#resolveAny(path, relativeTo);
    if (result == null) return null;
    if (!this.#files.includes(result)) return null;
    return result;
  }

  #resolveAny(path: string, relativeTo: string): string | null {
    if (path.startsWith("/")) return this.#resolveAbsolute(path);
    if (!path.startsWith(".")) return null;
    return this.#resolveRelative(path, relativeTo);
  }

  #resolveAbsolute(path: string): string | null {
    if (!path.startsWith(this.#pathPrefix)) return null;
    const root = this.#directory;
    return nodePath.join(root, `/${path.replace(this.#pathPrefix, "")}`);
  }

  #resolveRelative(path: string, relativeTo: string): string {
    const dir = nodePath.dirname(relativeTo);
    return nodePath.join(dir, path);
  }
}
