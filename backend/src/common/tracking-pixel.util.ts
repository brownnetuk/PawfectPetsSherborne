// The smallest valid GIF: a 1x1 transparent image, served by
// GET /invoices/:id/pixel.gif and /quotes/:id/pixel.gif -- appended to a
// sent invoice/quote email's body so the customer's mail client requesting
// it (to render the "image") is the "opened" signal that stamps openedAt.
const TRANSPARENT_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';

export function transparentGifBuffer(): Buffer {
  return Buffer.from(TRANSPARENT_GIF_BASE64, 'base64');
}

/** Builds an invisible <img> tag pointing at the given absolute pixel URL, appended to a sent email's body. */
export function trackingPixelHtml(pixelUrl: string): string {
  return `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
}

// The backend has no other reason to know its own publicly-reachable origin
// (CORS is wide open, and every other response is JSON over a same-request
// context) -- this is the one place an *absolute* URL has to be embedded in
// content that isn't part of the current request, so it needs an explicit
// env var rather than something derivable from the request. Falls back to
// localhost for local dev; must be set to the real deployed backend URL in
// production or the pixel (and therefore open tracking) silently 404s.
export function publicApiUrl(): string {
  return process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
}
