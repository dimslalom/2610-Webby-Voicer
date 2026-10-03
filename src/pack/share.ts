import JSZip from 'jszip';

export async function zipFolder(files: FileList | File[]): Promise<Blob> {
  const zip = new JSZip();
  for (const file of Array.from(files)) {
    const path = file.webkitRelativePath || file.name;
    if (path.startsWith('/') || path.split('/').includes('..')) continue;
    zip.file(path, file);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
}
