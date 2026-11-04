export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/** Rasterises an SVG document at `scale` times its size onto its background. */
export async function svgToPng(svg: string, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(svgBlob(svg));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');
    // Paint the root <svg> CSS background (SquiggleCam's paper colour), or
    // white, explicitly rather than relying on how a browser rasterises it.
    context.fillStyle = /^<svg[^>]*style="background: ([^";]+)/.exec(svg)?.[1] ?? '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode the PNG.'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
