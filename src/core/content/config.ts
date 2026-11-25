// Where the PUBLISHED course files live (P11 T7, DECISIONS Q24: the base URL of the content is ONE config value).
// Today the content is served by the app's own build, so the default is `BASE_URL` + `content/`. A build may set `VITE_CONTENT_BASE`
// (for example `https://example.org/data/`) to read the content from somewhere else; nothing else in the app needs to change,
// because every content URL comes from `contentUrl` in `loader.ts`, which starts with `CONTENT_BASE`.

/** Exactly one `/` at the end: added when missing, never doubled. */
function withTrailingSlash(base: string): string {
  return `${base.replace(/\/+$/, '')}/`;
}

/**
 * The content base for a build. `override` is the raw `VITE_CONTENT_BASE`: anything that is not a non-blank text is ignored
 * (the default is used). Pure, so the rule is tested without touching the build environment.
 */
export function resolveContentBase(baseUrl: string, override?: unknown): string {
  const custom = typeof override === 'string' ? override.trim() : '';
  if (custom !== '') return withTrailingSlash(custom);
  return `${withTrailingSlash(baseUrl)}content/`;
}

/** The ONE content base of this build; always ends with a single `/`. */
export const CONTENT_BASE: string = resolveContentBase(import.meta.env.BASE_URL, import.meta.env.VITE_CONTENT_BASE);
