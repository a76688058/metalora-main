export const STORAGE_BASE_URL = 'https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public';

export const getFullImageUrl = (path: string | null | undefined, isWorkshop: boolean = false) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  
  // 이미 버킷 경로가 포함되어 있는 경우
  if (path.includes('workshop/') || path.includes('products/')) {
    return `${STORAGE_BASE_URL}/${path}`;
  }
  
  // 버킷 경로가 없는 경우 플래그에 따라 추가
  const bucket = isWorkshop ? 'workshop' : 'products';
  return `${STORAGE_BASE_URL}/${bucket}/${path}`;
};
