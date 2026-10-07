/** Tiffany's GCash QR card, bundled in public/. */
const DEFAULT_GCASH_QR_PATH = "/gcash-qr.jpg";

/** Pixel size of the bundled QR card image. */
export const GCASH_QR_SIZE = { width: 1120, height: 1560 } as const;

/**
 * The QR image shown on payment pages. GCASH_QR_IMAGE_PATH can point to a
 * different file in public/; anything that is not a local path is ignored.
 */
export function gcashQrPath() {
  const configured = process.env.GCASH_QR_IMAGE_PATH?.trim() ?? "";

  return configured.startsWith("/") && !configured.startsWith("//")
    ? configured
    : DEFAULT_GCASH_QR_PATH;
}
