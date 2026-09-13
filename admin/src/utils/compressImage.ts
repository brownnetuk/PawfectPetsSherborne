// Downscales an image file to at most `maxWidth` and re-encodes it as JPEG,
// returning a base64 data URL. Uploads previously went up raw (a phone photo
// is easily 3-4 MB), which made anything embedding them -- note attachments
// especially -- slow to fetch on the other end.
export async function compressImageToDataUrl(file: File, maxWidth = 1200, quality = 0.72): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not read the image'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
