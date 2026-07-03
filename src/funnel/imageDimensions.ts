/**
 * Reads the pixel dimensions of an image file/blob by loading it into an
 * <img> element. Kept as its own small module so tests can mock it directly
 * — jsdom doesn't decode real image bytes, so exercising this via a real
 * Image load isn't practical in unit tests.
 */
export function readImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = url;
  });
}
