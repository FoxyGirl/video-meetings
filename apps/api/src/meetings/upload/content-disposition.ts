// RFC 5987 percent-encoding for the filename*=UTF-8''... extended notation:
// encodeURIComponent leaves a few attr-char-excluded characters
// (' ( ) *) unescaped, so they need a manual pass on top of it.
function encodeRfc5987ValueChars(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// Quoted-string escaping (RFC 6266/2616) plus a non-ASCII fallback for
// clients that don't understand filename* — never emit raw control
// characters or an unescaped quote/backslash into the header value.
function toAsciiFallbackFilename(originalName: string): string {
  return originalName.replace(/[\\"]/g, '_').replace(/[^\x20-\x7E]/g, '_');
}

// Builds a `Content-Disposition: attachment` header value carrying the
// original (possibly non-ASCII) file name safely, per RFC 5987/6266 —
// naive interpolation of an unescaped originalName risks a malformed
// header or response-splitting.
export function buildAttachmentContentDisposition(
  originalName: string,
): string {
  const asciiFallback = toAsciiFallbackFilename(originalName);
  const encoded = encodeRfc5987ValueChars(originalName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
