// @pdf-lib/fontkit is used through the small `FontkitLike` interface (gposGuard.ts) and pdf-lib's own registerFontkit();
// this shorthand declaration keeps the import typed without depending on the package shipping its own types.
declare module '@pdf-lib/fontkit';
