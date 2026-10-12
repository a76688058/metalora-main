import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-start justify-center gap-4 px-5 py-16">
      <h1 className="type-section-title text-text-primary">페이지를 찾을 수 없습니다</h1>
      <p className="type-supporting text-text-secondary">요청한 주소가 없거나 이동했습니다.</p>
      <Link to="/" className="focus-ring type-label text-text-primary underline underline-offset-4">
        홈으로 돌아가기
      </Link>
    </section>
  );
}
