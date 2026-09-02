import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="page-header">
      <div className="wrap">
        <div className="sec-label mono">404</div>
        <h1>
          Page not found<span style={{ color: 'var(--lime)' }}>.</span>
        </h1>
        <p className="sub">
          <Link href="/" style={{ color: 'var(--olive)' }}>
            Back to home
          </Link>
        </p>
      </div>
    </section>
  );
}
