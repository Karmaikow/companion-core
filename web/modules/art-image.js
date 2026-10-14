// Prepare local artwork before sending it to the Core. Stored PNG limits also
// apply on the server; large originals never need to cross the HTTP boundary.
export const MAX_IMPORT_BYTES = 32_000_000;
export const MAX_PNG_BYTES = 4_000_000;
const MAX_PIXELS = 4_194_304;

export function artDimensions(width, height, frames = 1) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) throw Error('A imagem não tem dimensões válidas.');
  if (!Number.isInteger(frames) || frames < 1 || frames > 8) throw Error('Use de 1 a 8 quadros na faixa horizontal.');
  const scale = Math.min(1, 8192 / width, 2048 / height, Math.sqrt(MAX_PIXELS / width / height));
  const frameWidth = Math.max(1, Math.floor(width * scale / frames));
  return {width: frameWidth * frames, height: Math.max(1, Math.floor(height * scale))};
}

export async function decodeArtImage(input) {
  try {
    // The Core's CSP permits data: images, but deliberately excludes blob:.
    const src = input instanceof Blob ? await new Promise((resolve, reject) => {
      const reader = new FileReader();reader.onload = () => resolve(reader.result);
      reader.onerror = reject;reader.readAsDataURL(input);
    }) : input;
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  } catch {
    throw Error('Não foi possível abrir a imagem. Escolha um PNG, JPEG ou WebP válido.');
  }
}

export async function normalizeArtImage(image, frames = 1) {
  const originalWidth = image.naturalWidth, originalHeight = image.naturalHeight;
  let {width, height} = artDimensions(originalWidth, originalHeight, frames);
  const canvas = document.createElement('canvas');
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Seu navegador não conseguiu preparar a imagem.');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      // Fractional source widths cover the entire original strip, including
      // widths such as 2172 / 8. Destination cells always have integer widths.
      const sourceWidth = originalWidth / frames, frameWidth = width / frames;
      for (let frame = 0; frame < frames; frame++) {
        ctx.save();ctx.beginPath();ctx.rect(frame * frameWidth, 0, frameWidth, height);ctx.clip();
        ctx.drawImage(image, frame * sourceWidth, 0, sourceWidth, originalHeight, frame * frameWidth, 0, frameWidth, height);
        ctx.restore();
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('Seu navegador não conseguiu converter a imagem para PNG.');
      if (blob.size <= MAX_PNG_BYTES) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(Error('Não foi possível preparar o PNG.'));reader.readAsDataURL(blob);
        });
        return {dataUrl, width, height, originalWidth, originalHeight, bytes: blob.size};
      }
      // No JPEG fallback: keep alpha while reducing unusually detailed PNGs.
      const scale = Math.min(.8, Math.sqrt(MAX_PNG_BYTES / blob.size) * .9);
      width = Math.max(frames, Math.floor(width * scale / frames) * frames);
      height = Math.max(1, Math.floor(height * scale));
    }
    throw Error('Não foi possível preparar esta imagem dentro do limite do Core.');
  } finally {
    canvas.width = canvas.height = 1;
  }
}
