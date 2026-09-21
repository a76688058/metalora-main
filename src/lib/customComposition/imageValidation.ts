const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HEIC_MIME = new Set(['image/heic', 'image/heif', 'image/heic-sequence']);

export const SUPPORTED_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export const UNSUPPORTED_IMAGE_MESSAGE = '이 이미지 형식은 사용할 수 없습니다.';
export const UNREADABLE_IMAGE_MESSAGE = '이미지를 불러올 수 없습니다. 다른 사진을 선택해 주세요.';

export type CustomImageValidationResult =
  | { ok: true; objectUrl: string; width: number; height: number }
  | { ok: false; message: string };

function mimeOf(file: File): string {
  const mime = (file.type || '').toLowerCase();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

function extensionOf(file: File): string {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

function isHeicLike(file: File): boolean {
  const mime = mimeOf(file);
  const ext = extensionOf(file);
  return HEIC_MIME.has(mime) || ext === 'heic' || ext === 'heif';
}

function isSvgLike(file: File): boolean {
  return mimeOf(file) === 'image/svg+xml' || extensionOf(file) === 'svg';
}

function isSupportedMime(mime: string): boolean {
  return SUPPORTED_MIME.has(mime);
}

function isSupportedExtension(ext: string): boolean {
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp';
}

function looksSupported(file: File): boolean {
  const mime = mimeOf(file);
  if (mime && mime !== 'application/octet-stream') return isSupportedMime(mime);
  return isSupportedExtension(extensionOf(file));
}

function decodeImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      image.onload = null;
      image.onerror = null;
      image.src = '';
      if (!width || !height) {
        reject(new Error('zero-dimension'));
        return;
      }
      resolve({ width, height });
    };
    image.onerror = () => reject(new Error('undecodable'));
    image.src = url;
  });
}

/** Local MIME + browser-decode gate. Does not upload. */
export async function validateCustomImageFile(file: File): Promise<CustomImageValidationResult> {
  if (!file || file.size <= 0) {
    return { ok: false, message: UNREADABLE_IMAGE_MESSAGE };
  }

  if (isHeicLike(file) || isSvgLike(file) || !looksSupported(file)) {
    return { ok: false, message: UNSUPPORTED_IMAGE_MESSAGE };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const { width, height } = await decodeImageSize(objectUrl);
    return { ok: true, objectUrl, width, height };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return { ok: false, message: UNREADABLE_IMAGE_MESSAGE };
  }
}
