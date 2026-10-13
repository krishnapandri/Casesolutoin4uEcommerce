import { ArrowLeft, Search } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <main className="not-found-page">
      <Link href="/" className="brand" aria-label="CaseSolution4U home">
        <span className="brand-symbol">c<span>4</span></span>
        <span className="brand-word">case<span>solution</span><b>4U</b></span>
      </Link>
      <div className="not-found-content">
        <span className="eyebrow">A little detour</span>
        <h1 className="display">This page<br /><em>isn’t in the picture.</em></h1>
        <p>That link may have moved. The shop is still right here.</p>
        <div className="not-found-actions">
          <Link href="/" className="button-primary"><ArrowLeft size={16} /> Back to home</Link>
          <Link href="/products" className="button-secondary"><Search size={16} /> Explore the shop</Link>
        </div>
      </div>
      <span className="not-found-code">404 / NOT FOUND</span>
    </main>
  );
}
