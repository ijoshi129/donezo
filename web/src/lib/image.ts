// Read a picked image file into a downscaled JPEG/PNG data URL so we don't
// ship multi-megabyte originals to the backend (which decodes data: URLs and
// writes them to /app/data/images).

const MAX_EDGE = 1400;
const QUALITY = 0.82;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("That file isn’t an image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn’t read that file."));
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn’t decode that image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        if (scale === 1 && src.length < 600_000) {
          resolve(src); // already small enough — keep as-is
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const hasAlpha = file.type === "image/png";
        resolve(
          canvas.toDataURL(hasAlpha ? "image/png" : "image/jpeg", QUALITY),
        );
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
