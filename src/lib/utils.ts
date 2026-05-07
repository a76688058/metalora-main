export const STORAGE_BASE_URL = 'https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public';

export const getFullImageUrl = (path: string | null | undefined, isWorkshop: boolean = false) => {
  if (!path) return null;
  
  // HTTP 링크인 경우 쿼리 파라미터 보존 (Naver 등 외부 이미지의 경우 ?type= 파라미터가 필수)
  if (path.startsWith('http')) return path;
  
  // 내부 Supabase 스토리지 경로인 경우에만 불필요한 쿼리 제거 및 인코딩 처리
  const cleanPath = path.split('?')[0];
  
  // Normalize and encode path segments to prevent 403 on special characters like parenthesis or spaces
  const encodedPath = cleanPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  
  // 이미 버킷 경로가 포함되어 있는 경우
  if (cleanPath.includes('workshop/') || cleanPath.includes('products/')) {
    return `${STORAGE_BASE_URL}/${encodedPath}`;
  }
  
  // 버킷 경로가 없는 경우 플래그에 따라 추가
  const bucket = isWorkshop ? 'workshop' : 'products';
  return `${STORAGE_BASE_URL}/${bucket}/${encodedPath}`;
};

export const getOptimizedImageUrl = (url: string | null | undefined, width: number = 400) => {
  if (!url) return undefined;
  
  // If it's already a data URI or a local blob, return as is
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // URL에서 기존 쿼리 파라미터 (특히 ?type=w3840 등) 제거
  // Supabase Storage나 일부 최적화 서비스에서 허용되지 않는 파라미터가 포함되어 403을 유발할 수 있음
  const cleanUrl = url.split('?')[0];

  // Ensure we have an absolute URL
  const fullUrl = getFullImageUrl(cleanUrl);
  if (!fullUrl) return undefined;

  // 브라우저 캐시된 403 오류를 회피하기 위해 타임스탬프를 아주 드물게 추가하거나 
  // 필요한 경우에만 최적화 파라미터를 붙일 수 있음. 현재는 원본 로딩을 우선함.
  return fullUrl;
};
