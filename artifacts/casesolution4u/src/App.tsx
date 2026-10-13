import { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useUser, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  useCreateAdminOrder,
  useCreateCollection,
  useCreateProduct,
  useDeleteCollection,
  useDeleteProduct,
  useGetAdminHomeContent,
  useGetAdminSummary,
  useGetHomeContent,
  useGetProduct,
  useHealthCheck,
  useListAdminCollections,
  useListAdminOrders,
  useListAdminProducts,
  useListCollections,
  useListDevices,
  useListProducts,
  useSubscribeNewsletter,
  useUpdateCollection,
  useUpdateHomeContent,
  useUpdateOrder,
  useUpdateProduct,
  getGetAdminHomeContentQueryKey,
  getGetAdminSummaryQueryKey,
  getGetHomeContentQueryKey,
  getGetProductQueryKey,
  getHealthCheckQueryKey,
  getListAdminCollectionsQueryKey,
  getListAdminOrdersQueryKey,
  getListAdminProductsQueryKey,
  getListCollectionsQueryKey,
  getListDevicesQueryKey,
  getListProductsQueryKey,
} from '@workspace/api-client-react';
import type {
  AdminProduct,
  Collection,
  OrderLineInput,
  Product,
  ProductInput,
  StoreOrder,
} from '@workspace/api-client-react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  Link,
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
  useParams,
} from 'wouter';
import './index.css';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#b87586',
    colorForeground: '#35363b',
    colorMutedForeground: '#777278',
    colorDanger: '#b54848',
    colorBackground: '#fffdfa',
    colorInput: '#fffdfa',
    colorInputForeground: '#35363b',
    colorNeutral: '#ded6d3',
    fontFamily: 'DM Sans',
    borderRadius: '14px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdfa] rounded-[24px] w-[440px] max-w-full overflow-hidden border border-[#eadfdb] shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#35363b] font-bold',
    headerSubtitle: 'text-[#777278]',
    socialButtonsBlockButtonText: 'text-[#35363b] font-semibold',
    formFieldLabel: 'text-[#35363b] font-semibold',
    footerActionLink: 'text-[#a86376] font-semibold',
    footerActionText: 'text-[#777278]',
    dividerText: 'text-[#777278]',
    identityPreviewEditButton: 'text-[#a86376]',
    formFieldSuccessText: 'text-[#47745c]',
    alertText: 'text-[#853f45]',
    logoBox: 'rounded-2xl',
    logoImage: 'max-h-9',
    socialButtonsBlockButton: 'border-[#e7dcd8] rounded-xl',
    formButtonPrimary: 'rounded-full font-bold',
    formFieldInput: 'rounded-xl border-[#ded6d3]',
    footerAction: 'text-[#777278]',
    dividerLine: 'bg-[#e7dcd8]',
    alert: 'rounded-xl',
    otpCodeFieldInput: 'rounded-lg',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

type CartLine = { product: Product; quantity: number };
type CartApi = { items: CartLine[]; add: (p: Product) => void; remove: (id: string) => void; setQty: (id: string, n: number) => void; count: number; open: () => void };
const CartContext = createContext<CartApi | null>(null);
function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('Cart provider missing');
  return cart;
}
function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem('case-solution-cart') || '[]') as CartLine[]; } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  useEffect(() => { localStorage.setItem('case-solution-cart', JSON.stringify(items)); }, [items]);
  const api = useMemo<CartApi>(() => ({
    items,
    add: (product) => setItems((old) => {
      const existing = old.find((line) => line.product.id === product.id);
      return existing ? old.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(product.stockQuantity, line.quantity + 1) } : line) : [...old, { product, quantity: 1 }];
    }),
    remove: (id) => setItems((old) => old.filter((line) => line.product.id !== id)),
    setQty: (id, quantity) => setItems((old) => old.map((line) => line.product.id === id ? { ...line, quantity: Math.max(1, Math.min(line.product.stockQuantity || 1, quantity)) } : line)),
    count: items.reduce((sum, line) => sum + line.quantity, 0),
    open: () => setCartOpen(true),
  }), [items]);
  return <CartContext.Provider value={api}>{children}<CartDrawer open={cartOpen} close={() => setCartOpen(false)} /></CartContext.Provider>;
}

function money(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}
function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function Notice({ children, kind = 'info' }: { children: React.ReactNode; kind?: 'info' | 'error' | 'success' }) {
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`notice notice-${kind}`}><span className="notice-icon">{kind === 'error' ? <CircleAlert size={17} /> : kind === 'success' ? <Check size={17} /> : <Sparkles size={17} />}</span>{children}</div>;
}
function LoadRows() {
  return <div className="skeleton-stack" aria-label="Loading content"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /></div>;
}
function QueryState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: React.ReactNode }) {
  if (loading) return <LoadRows />;
  if (error) return <div className="state-card"><div className="state-mark"><CircleAlert size={20} /></div><h3>We couldn’t load this just now.</h3><p>Your place is saved. Try again in a moment.</p><button className="button-secondary" onClick={retry}>Try again</button></div>;
  return <>{children}</>;
}
function AdminQueryState({ loading, error, errorValue, retry, children }: { loading: boolean; error: boolean; errorValue: unknown; retry: () => void; children: React.ReactNode }) {
  const apiError = errorValue as { status?: number; message?: string } | undefined;
  if (error && (apiError?.status === 401 || apiError?.status === 403 || /staff.*not configured|allowlist/i.test(apiError?.message || ''))) {
    return <div className="staff-config-state"><div className="state-mark"><LockKeyhole size={20} /></div><div><h2>Staff access not configured</h2><p>Signing in is not enough to grant staff access. The server staff allowlist needs to be configured before this workspace can be used.</p></div></div>;
  }
  return <QueryState loading={loading} error={error} retry={retry}>{children}</QueryState>;
}

function Header() {
  const cart = useCart();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [mobile, setMobile] = useState(false);
  return <>
    <div className="announcement"><span>Good things for the phone you take everywhere.</span><Link href="/products">Browse the edit <ArrowRight size={13} /></Link></div>
    <header className="store-header">
      <div className="page-wrap header-inner">
        <button className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={mobile} onClick={() => setMobile((v) => !v)}><Menu size={21} /></button>
        <Link href="/" className="brand" aria-label="CaseSolution4U home"><span className="brand-symbol">c<span>4</span></span><span className="brand-word">case<span>solution</span><b>4U</b></span></Link>
        <nav className={`main-nav ${mobile ? 'nav-open' : ''}`} aria-label="Main navigation">
          <Link href="/products" onClick={() => setMobile(false)}>Shop all</Link>
          <Link href="/products?featured=true" onClick={() => setMobile(false)}>The edit</Link>
          <Link href="/#collections" onClick={() => setMobile(false)}>Collections</Link>
          <Link href="/#find-model" onClick={() => setMobile(false)}>Find your model</Link>
        </nav>
        <form className="header-search" onSubmit={(e) => { e.preventDefault(); setLocation(`/products?q=${encodeURIComponent(search)}`); }}>
          <Search size={17} /><input aria-label="Search cases and accessories" placeholder="Find your next favourite" value={search} onChange={(e) => setSearch(e.target.value)} /><button aria-label="Submit search"><ArrowRight size={16} /></button>
        </form>
        <div className="header-actions">
          <Link href="/sign-in" className="account-link desktop-only">Sign in</Link>
          <button className="cart-button" onClick={cart.open} aria-label={`Open cart, ${cart.count} items`}><ShoppingBag size={19} /><span className="cart-count">{cart.count}</span></button>
        </div>
      </div>
    </header>
  </>;
}
function Footer() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState('');
  const subscribe = useSubscribeNewsletter();
  return <footer className="footer">
    <div className="page-wrap footer-main">
      <div className="footer-brand"><Link href="/" className="brand"><span className="brand-symbol">c<span>4</span></span><span className="brand-word">case<span>solution</span><b>4U</b></span></Link><p>Little details. A little more you.</p><p className="footer-note">Thoughtful phone accessories for everyday life.</p></div>
      <div><p className="footer-title">Explore</p><Link href="/products">Shop all</Link><Link href="/#collections">Collections</Link><Link href="/#find-model">Find your model</Link></div>
      <div><p className="footer-title">Your account</p><Link href="/sign-in">Sign in</Link><Link href="/sign-up">Create account</Link><Link href="/admin">Staff sign in</Link></div>
      <form className="newsletter" onSubmit={(e) => { e.preventDefault(); subscribe.mutate({ data: { email } }, { onSuccess: (r) => setResult(r.message), onError: () => setResult('We couldn’t subscribe you just now. Please try again.') }); }}>
        <p className="footer-title">A little note from us</p><p>New collections, when they arrive. No noise.</p><div className="newsletter-input"><input aria-label="Email address for updates" type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} /><button aria-label="Subscribe" disabled={subscribe.isPending}><ArrowRight size={17} /></button></div>{result && <span className="newsletter-result" role="status">{result}</span>}
      </form>
    </div>
    <div className="footer-bottom page-wrap"><span>© CaseSolution4U</span><span>Made for your everyday carry.</span><Link href="/admin">Staff</Link></div>
  </footer>;
}
function StoreLayout({ children }: { children: React.ReactNode }) {
  return <div className="store-shell"><Header />{children}<Footer /></div>;
}
function CartDrawer({ open, close }: { open: boolean; close: () => void }) {
  const cart = useCart();
  if (!open) return null;
  const total = cart.items.reduce((n, line) => n + line.product.pricePaise * line.quantity, 0);
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Your bag">
      <div className="drawer-head"><div><span className="eyebrow">Your picks</span><h2>Your bag <span>({cart.count})</span></h2></div><button className="icon-button" onClick={close} aria-label="Close bag"><X /></button></div>
      {cart.items.length === 0 ? <div className="cart-empty"><ShoppingBag size={27} /><h3>Your bag is taking a breather.</h3><p>When something catches your eye, you’ll find it here.</p><Link className="button-primary" href="/products" onClick={close}>Explore the shop <ArrowRight size={16} /></Link></div> : <>
        <div className="cart-lines">{cart.items.map(({ product, quantity }) => <div className="cart-line" key={product.id}>
          <ProductImage product={product} compact /><div className="cart-line-info"><Link href={`/products/${product.slug}`} onClick={close}>{product.name}</Link><span>{money(product.pricePaise)}</span><div className="quantity-control"><button onClick={() => quantity > 1 ? cart.setQty(product.id, quantity - 1) : cart.remove(product.id)} aria-label="Decrease quantity"><Minus size={13} /></button><span>{quantity}</span><button onClick={() => cart.setQty(product.id, quantity + 1)} aria-label="Increase quantity"><Plus size={13} /></button></div></div><button className="remove-line" onClick={() => cart.remove(product.id)} aria-label={`Remove ${product.name}`}><Trash2 size={16} /></button>
        </div>)}</div>
        <div className="cart-total"><span>Items total</span><strong>{money(total)}</strong></div>
        <p className="cart-disclaimer">Your bag is a saved selection. Checkout isn’t available on this site.</p>
        <Link className="button-secondary full-button" href="/products" onClick={close}>Continue browsing <ArrowRight size={15} /></Link>
      </>}
    </aside>
  </div>;
}

function ProductImage({ product, compact = false }: { product: Pick<Product, 'imageUrl' | 'imageAlt' | 'name' | 'category'>; compact?: boolean }) {
  return <div className={`product-image ${compact ? 'product-image-compact' : ''}`}>
    {product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt || product.name} loading="lazy" /> : <div className="image-empty" aria-label={`No image supplied for ${product.name}`}><Package size={26} strokeWidth={1.3} /><span className="image-empty-label">No image supplied</span></div>}
  </div>;
}
function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const savingsValid = product.compareAtPricePaise != null && product.compareAtPricePaise > product.pricePaise;
  return <article className="product-card" data-testid={`card-product-${product.id}`}>
    <Link href={`/products/${product.slug}`} className="product-link"><div className="product-media"><ProductImage product={product} />{product.featured && <span className="product-tag">In the edit</span>}{!product.inStock && <span className="product-stock-tag">Out of stock</span>}</div>
      <div className="product-copy"><span className="product-category">{product.category}</span><h3>{product.name}</h3><p>{product.compatibility.slice(0, 2).join(' · ') || 'Explore details for compatibility'}</p><div className="product-price"><strong>{money(product.pricePaise)}</strong>{savingsValid && <del>{money(product.compareAtPricePaise!)}</del>}</div></div>
    </Link>
    <button className="quick-add" disabled={!product.inStock} onClick={() => cart.add(product)}>{product.inStock ? <><Plus size={15} /> Add to bag</> : 'Unavailable'}</button>
  </article>;
}
function ProductGrid({ products, loading, error, retry, emptyText = 'Nothing here just yet.' }: { products?: Product[]; loading: boolean; error: boolean; retry: () => void; emptyText?: string }) {
  return <QueryState loading={loading} error={error} retry={retry}>{products?.length ? <div className="product-grid">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div> : <div className="state-card empty-state"><div className="state-mark"><ShoppingBag size={20} /></div><h3>{emptyText}</h3><p>Try another search or take a look around the shop.</p><Link className="button-secondary" href="/products">Browse all products</Link></div>}</QueryState>;
}

function HomePage() {
  const [, setLocation] = useLocation();
  const home = useGetHomeContent();
  const featured = useListProducts({ featured: true, limit: 4 });
  const collections = useListCollections();
  const devices = useListDevices();
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const brands = [...new Set((devices.data || []).map((d) => d.brand))];
  const models = (devices.data || []).filter((d) => !brand || d.brand === brand);
  return <StoreLayout>
    {home.data?.announcement && <div className="home-announcement"><span>{home.data.announcement}</span></div>}
    {home.isError && <div className="home-announcement home-error" role="status">The latest store notes didn’t load. <button onClick={() => void home.refetch()}>Try again</button></div>}
    <main>
      <section className="hero page-wrap">
        <div className="hero-content"><span className="eyebrow hero-eyebrow"><span className="eyebrow-rule" /> A little more you, every day</span><h1 className="display">Your phone.<br /><em>Your style.</em></h1><p>Find the small things that make your everyday feel a little more like yours.</p><div className="hero-actions"><Link className="button-primary" href="/products">Shop Now <ArrowRight size={17} /></Link><Link className="hero-text-link" href="/#find-model">Find your phone model <ArrowDown size={15} /></Link></div><div className="hero-quiet-note"><span className="hero-dot" /> Made for your everyday carry</div></div>
        <div className="hero-art" aria-label="Abstract editorial illustration of a phone and playful shapes" role="img">
          <div className="art-paper"><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /><span className="art-sun" /><span className="art-caption">YOUR EVERYDAY<br />OBJECT, REIMAGINED</span><div className="art-phone"><div className="phone-camera"><i /><i /><i /></div><div className="phone-detail" /><span className="phone-mark">c4</span></div><div className="art-shape shape-lavender" /><div className="art-shape shape-sage" /><span className="art-flower" /></div>
          <div className="hero-art-index">01 / YOUR DAILY SIDEKICK</div>
        </div>
        <span className="hero-side-note">Carry what feels like you</span>
      </section>
      <section className="trust-strip page-wrap" aria-label="Store information">{(home.data?.trustItems?.length ? home.data.trustItems : ['Thoughtful finds', 'Easy to explore', 'Choose by phone model']).map((item, i) => <div className="trust-item" key={`${item}-${i}`}><span className="trust-number">0{i + 1}</span><span>{item}</span></div>)}</section>
      <section className="device-finder page-wrap" id="find-model">
        <div className="finder-note"><span className="eyebrow">Start with your phone</span><h2 className="display">Begin with<br />your device.</h2><p>Choose your device and we’ll narrow the shop down to listed compatibility.</p></div>
        <form className="finder-form" onSubmit={(e) => { e.preventDefault(); setLocation(`/products?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`); }}>
          <label>Phone brand<select value={brand} onChange={(e) => { setBrand(e.target.value); setModel(''); }} className="field"><option value="">{devices.isLoading ? 'Loading brands…' : devices.isError ? 'Options unavailable' : 'Choose a brand'}</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
          <label>Phone model<select value={model} onChange={(e) => setModel(e.target.value)} className="field" disabled={!brand}><option value="">{devices.isLoading ? 'Loading models…' : 'Choose a model'}</option>{models.map((d) => <option key={d.model} value={d.model}>{d.model}</option>)}</select></label>
          <button className="button-primary" type="submit" disabled={!brand || !model}>See what fits <ArrowRight size={16} /></button>
          <span className="finder-footnote">{devices.isError ? 'We couldn’t load device options just now. ' : 'Device options reflect the models in our catalogue. '}{devices.isError && <Link href="/products">Browse products instead.</Link>}</span>
        </form>
      </section>
      <section className="collection-section page-wrap" id="collections">
        <div className="section-heading"><div><span className="eyebrow">Find your kind of thing</span><h2 className="display">A collection for every mood.</h2></div><Link href="/products" className="arrow-link">Explore everything <ArrowUpRight size={17} /></Link></div>
        <QueryState loading={collections.isLoading} error={collections.isError} retry={() => void collections.refetch()}>{collections.data?.length ? <div className="collection-tiles">{collections.data.slice(0, 3).map((collection, index) => <CollectionTile collection={collection} index={index} key={collection.id} />)}</div> : <div className="soft-empty">New collections will find their way here soon.</div>}</QueryState>
      </section>
      <section className="featured-section">
        <div className="page-wrap">
          <div className="section-heading"><div><span className="eyebrow">A few things to meet</span><h2 className="display">Picked for the everyday.</h2></div><Link href="/products?featured=true" className="arrow-link">See the full edit <ArrowUpRight size={17} /></Link></div>
          <ProductGrid products={featured.data} loading={featured.isLoading} error={featured.isError} retry={() => void featured.refetch()} emptyText="Our featured edit is still taking shape." />
        </div>
      </section>
      <section className="editorial-band page-wrap"><div className="editorial-graphic"><div className="graphic-loop loop-a" /><div className="graphic-loop loop-b" /><div className="graphic-circle" /><span>made for<br />your day</span></div><div className="editorial-copy"><span className="eyebrow">Small detail, big feeling</span><h2 className="display">Your phone goes everywhere.<br /><em>Make it feel like yours.</em></h2><p>Thoughtful accessories that make room for your own point of view.</p><Link className="button-secondary" href="/products">Find your next favourite <ArrowRight size={16} /></Link></div></section>
      <section className="newsletter-callout page-wrap"><span className="eyebrow">A good thing, occasionally</span><h2 className="display">A little note from us.</h2><p>New collections, when they arrive. No noise.</p><Link href="/#newsletter" className="button-secondary" onClick={(e) => { e.preventDefault(); document.querySelector('.newsletter input')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelector<HTMLInputElement>('.newsletter input')?.focus(); }}>Leave us your email <ArrowRight size={15} /></Link></section>
    </main>
  </StoreLayout>;
}
function CollectionTile({ collection, index }: { collection: Collection; index: number }) {
  return <Link href={`/collections/${collection.slug}`} className={`collection-tile collection-tile-${index + 1}`}>
    {collection.imageUrl ? <img src={collection.imageUrl} alt={collection.imageAlt || collection.name} loading="lazy" /> : <div className="collection-art"><span className="collection-art-ring" /><span className="collection-art-pill" /><span className="collection-art-spark" /></div>}
    <div className="collection-tile-copy"><span className="collection-counter">0{index + 1} / {collection.productCount} {collection.productCount === 1 ? 'piece' : 'pieces'}</span><h3>{collection.name}</h3><span className="collection-open" aria-label={`Browse ${collection.name}`}><ArrowUpRight size={18} /></span></div>
  </Link>;
}

function CatalogPage() {
  const params = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(params.get('q') || '');
  const [brand, setBrand] = useState(params.get('brand') || '');
  const [model, setModel] = useState(params.get('model') || '');
  const [collection, setCollection] = useState(params.get('collection') || '');
  const [featured, setFeatured] = useState(params.get('featured') === 'true');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState({ q: search || undefined, brand: brand || undefined, model: model || undefined, collection: collection || undefined, featured: featured ? true : undefined, limit: 60 });
  const products = useListProducts(query);
  const devices = useListDevices();
  const collections = useListCollections();
  const deviceBrands = [...new Set((devices.data || []).map((d) => d.brand))];
  const deviceModels = (devices.data || []).filter((d) => !brand || d.brand === brand);
  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setQuery({ q: search || undefined, brand: brand || undefined, model: model || undefined, collection: collection || undefined, featured: featured ? true : undefined, limit: 60 });
  }
  return <StoreLayout><main className="page-wrap catalog-page">
    <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><span>Shop all</span></div>
    <div className="catalog-heading"><div><span className="eyebrow">The CaseSolution4U shop</span><h1 className="display">{featured ? 'The edit.' : 'Find your everyday.'}</h1><p>Browse the catalogue, or start with the phone in your hand.</p></div><button className="button-secondary filter-toggle" onClick={() => setFiltersOpen((v) => !v)}><SlidersHorizontal size={16} /> Filters {filtersOpen ? <X size={15} /> : null}</button></div>
    <div className="catalog-layout">
      <form className={`filter-panel ${filtersOpen ? 'filters-visible' : ''}`} onSubmit={applyFilters}>
        <div className="filter-panel-title"><span>Refine your search</span><button type="button" onClick={() => { setSearch(''); setBrand(''); setModel(''); setCollection(''); setFeatured(false); setQuery({ q: undefined, brand: undefined, model: undefined, collection: undefined, featured: undefined, limit: 60 }); }}>Clear</button></div>
        <label>Search<input className="field" type="search" placeholder="Try a name or style" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label>Brand<select className="field" value={brand} onChange={(e) => { setBrand(e.target.value); setModel(''); }}><option value="">Any brand</option>{deviceBrands.map((b) => <option key={b}>{b}</option>)}</select></label>
        <label>Model<select className="field" value={model} disabled={!brand} onChange={(e) => setModel(e.target.value)}><option value="">Any model</option>{deviceModels.map((d) => <option key={d.model}>{d.model}</option>)}</select></label>
        <label>Collection<select className="field" value={collection} onChange={(e) => setCollection(e.target.value)}><option value="">Every collection</option>{collections.data?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
        <label className="check-row"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /><span>Only show the edit</span></label>
        <button className="button-primary full-button" type="submit">Show products <ArrowRight size={15} /></button>
      </form>
      <section className="catalog-results"><div className="result-toolbar"><span>{products.data ? `${products.data.length} ${products.data.length === 1 ? 'find' : 'finds'}` : 'A considered little selection'}</span><span>Prices shown in INR</span></div><ProductGrid products={products.data} loading={products.isLoading} error={products.isError} retry={() => void products.refetch()} /></section>
    </div>
  </main></StoreLayout>;
}
function CollectionPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const collections = useListCollections();
  const result = useListProducts({ collection: slug, limit: 60 });
  const collection = collections.data?.find((c) => c.slug === slug);
  return <StoreLayout><main className="page-wrap catalog-page"><div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/#collections">Collections</Link><span>/</span><span>{collection?.name || slug}</span></div>
    <div className="collection-hero"><span className="eyebrow">The collection edit</span><h1 className="display">{collection?.name || 'A closer look'}</h1><p>{collection?.description || 'A considered collection from CaseSolution4U.'}</p><span className="collection-product-count">{collection?.productCount ?? result.data?.length ?? 0} pieces to explore</span></div>
    <ProductGrid products={result.data} loading={result.isLoading || collections.isLoading} error={result.isError || collections.isError} retry={() => { void result.refetch(); void collections.refetch(); }} />
  </main></StoreLayout>;
}
function ProductPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const query = useGetProduct(slug);
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const product = query.data;
  return <StoreLayout><main className="page-wrap product-detail-page"><div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/products">Shop all</Link><span>/</span><span>{product?.name || 'Product'}</span></div>
    {query.isLoading ? <div className="detail-skeleton"><div className="skeleton" /><LoadRows /></div> : query.isError || !product ? <div className="state-card"><div className="state-mark"><CircleAlert size={20} /></div><h2>We couldn’t find that product.</h2><p>It may have moved. Take a look through the current shop.</p><Link className="button-primary" href="/products">Browse the shop <ArrowRight size={16} /></Link></div> : <div className="product-detail">
      <div className="detail-image"><ProductImage product={product} /></div><div className="detail-info"><span className="eyebrow">{product.category}</span><h1 className="display">{product.name}</h1><div className="detail-prices"><strong>{money(product.pricePaise)}</strong>{product.compareAtPricePaise != null && product.compareAtPricePaise > product.pricePaise && <del>{money(product.compareAtPricePaise)}</del>}</div><div className={`stock-note ${product.inStock ? 'stock-available' : 'stock-unavailable'}`}><span />{product.inStock ? `In stock · ${product.stockQuantity} available` : 'Currently out of stock'}</div>
        {product.description && <p className="detail-description">{product.description}</p>}
        <div className="compatibility-box"><span className="eyebrow">Made to fit</span><p>{product.compatibility.length ? product.compatibility.join(' · ') : 'Compatibility details are not listed for this item.'}</p></div>
        <button className="button-primary detail-add" disabled={!product.inStock} onClick={() => { cart.add(product); setAdded(true); }}>{added ? <><Check size={17} /> Added to your bag</> : <><ShoppingBag size={17} /> {product.inStock ? 'Add to bag' : 'Unavailable'}</>}</button>
        <p className="no-checkout"><LockKeyhole size={14} /> Your bag saves your picks. Checkout isn’t available here.</p>
        <div className="detail-collection-list">{product.collections.map((c) => <Link key={c.id} href={`/collections/${c.slug}`}>Part of {c.name} <ArrowUpRight size={14} /></Link>)}</div>
      </div>
    </div>}
  </main></StoreLayout>;
}

function SignInPage() {
  return <div className="auth-page"><div className="auth-aside"><Link href="/" className="brand"><span className="brand-symbol">c<span>4</span></span><span className="brand-word">case<span>solution</span><b>4U</b></span></Link><div><span className="eyebrow">Your everyday, your way</span><h1 className="display">Welcome back<br /><em>to your kind of carry.</em></h1><p>Your saved picks are right where you left them.</p></div><Link href="/" className="auth-home"><ArrowLeft size={15} /> Back to the shop</Link></div><div className="auth-widget"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>;
}
function SignUpPage() {
  return <div className="auth-page"><div className="auth-aside"><Link href="/" className="brand"><span className="brand-symbol">c<span>4</span></span><span className="brand-word">case<span>solution</span><b>4U</b></span></Link><div><span className="eyebrow">A little more you</span><h1 className="display">Make room<br /><em>for your own style.</em></h1><p>Come in, find your fit, save the things you love.</p></div><Link href="/" className="auth-home"><ArrowLeft size={15} /> Back to the shop</Link></div><div className="auth-widget"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>;
}

const adminLinks = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/collections', label: 'Collections', icon: Sparkles },
  { href: '/admin/homepage', label: 'Homepage', icon: SlidersHorizontal },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
];
function AdminFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  return <div className="admin-shell">
    <aside className="admin-sidebar"><Link href="/" className="brand admin-brand"><span className="brand-symbol">c<span>4</span></span><span className="brand-word">case<span>solution</span><b>4U</b></span></Link><div className="admin-sidebar-label">Workspace</div><nav className="admin-nav">{adminLinks.map((item) => <Link href={item.href} key={item.href} className={`admin-nav-item ${location === item.href ? 'admin-nav-active' : ''}`}><item.icon size={18} /><span>{item.label}</span></Link>)}</nav><div className="admin-sidebar-bottom"><div className="connection-indicator"><span className={health.isSuccess ? 'connection-dot' : 'connection-dot connection-off'} />{health.isLoading ? 'Checking connection' : health.isSuccess ? 'Store connection live' : 'Store connection unavailable'}</div><button className="admin-user" onClick={() => void signOut({ redirectUrl: basePath || '/' })}><span className="admin-avatar">{user?.firstName?.[0] || 'S'}</span><span><b>{user?.fullName || 'Staff account'}</b><small>Sign out</small></span><ArrowUpRight size={15} /></button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><Link href="/" className="admin-store-link"><ArrowLeft size={15} /> Back to store</Link><span>CaseSolution4U <span className="topbar-divider">/</span> Staff</span></header><div className="admin-content"><div className="admin-page-heading"><div><span className="eyebrow">Store workspace</span><h1>{title}</h1><p>{subtitle}</p></div><span className="admin-date">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></div>{children}</div></main>
  </div>;
}
function AccessDenied() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <div className="admin-guard-loading"><LoadRows /></div>;
  if (!isSignedIn) return <div className="staff-gate"><div className="staff-gate-card"><div className="brand-symbol">c<span>4</span></div><span className="eyebrow">CaseSolution4U staff</span><h1 className="display">A quiet space<br />for the busy bits.</h1><p>Sign in to continue to the staff workspace.</p><Link href="/sign-in" className="button-primary">Sign in to staff <ArrowRight size={16} /></Link><Link href="/" className="staff-back"><ArrowLeft size={14} /> Back to shop</Link></div></div>;
  return null;
}
function StaffOnly({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <div className="admin-guard-loading"><LoadRows /></div>;
  if (!isSignedIn) return <AccessDenied />;
  return <>{children}</>;
}
function AdminOverview() {
  const summary = useGetAdminSummary();
  const products = useListAdminProducts();
  const orders = useListAdminOrders();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const isConfigError = [summary.error, products.error, orders.error].some((err) => {
    const e = err as { status?: number; message?: string } | undefined;
    return e?.status === 401 || e?.status === 403 || /staff.*not configured|allowlist/i.test(e?.message || '');
  });
  return <AdminFrame title="A clear view of the shop." subtitle="The practical bits, all in one place."><QueryState loading={summary.isLoading} error={summary.isError && !isConfigError} retry={() => void summary.refetch()}>{isConfigError ? <div className="staff-config-state"><div className="state-mark"><LockKeyhole size={20} /></div><div><h2>Staff access not configured</h2><p>Signing in is not enough to grant staff access. The server staff allowlist needs to be configured before this workspace can be used.</p></div></div> : <>
    <div className="summary-grid">{[
      { label: 'Products in the catalogue', value: summary.data?.productCount ?? 0, detail: 'All listed and draft products', tone: 'rose' },
      { label: 'Running low', value: summary.data?.lowStockCount ?? 0, detail: 'Products needing a stock check', tone: 'sage' },
      { label: 'Orders recorded', value: summary.data?.orderCount ?? 0, detail: 'Received outside this website', tone: 'lilac' },
      { label: 'Open orders', value: summary.data?.openOrderCount ?? 0, detail: 'Still being fulfilled', tone: 'cream' },
    ].map((item) => <div className={`summary-card summary-${item.tone}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>
    <div className="overview-grid"><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">Connection</span><h2>Store status</h2></div><span className={`status-pill ${health.isSuccess ? 'status-good' : 'status-warn'}`}><i />{health.isSuccess ? 'Online' : health.isLoading ? 'Checking' : 'Unavailable'}</span></div><p className="panel-copy">The storefront API is {health.isSuccess ? 'responding.' : health.isLoading ? 'being checked.' : 'not responding at the moment.'} This is a connection check, not an authorization check.</p></section>
    <section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">Useful next steps</span><h2>Keep things current</h2></div></div><div className="admin-shortcuts"><Link href="/admin/products"><span><Package size={17} /></span>Manage products<ArrowRight size={15} /></Link><Link href="/admin/collections"><span><Sparkles size={17} /></span>Shape collections<ArrowRight size={15} /></Link><Link href="/admin/homepage"><span><SlidersHorizontal size={17} /></span>Refresh homepage copy<ArrowRight size={15} /></Link><Link href="/admin/orders"><span><ShoppingBag size={17} /></span>Record an order<ArrowRight size={15} /></Link></div></section></div>
    <section className="admin-panel overview-note"><span className="eyebrow">A note on orders</span><p>Orders shown here are recorded by staff after being received outside this website. The storefront does not collect payment or submit orders.</p></section>
  </>}</QueryState></AdminFrame>;
}

function ProductForm({ product, onClose }: { product?: AdminProduct; onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const collections = useListAdminCollections();
  const [name, setName] = useState(product?.name || '');
  const [slug, setSlug] = useState(product?.slug || '');
  const [description, setDescription] = useState(product?.description || '');
  const [category, setCategory] = useState(product?.category || '');
  const [price, setPrice] = useState(product ? String(product.pricePaise / 100) : '');
  const [compare, setCompare] = useState(product?.compareAtPricePaise ? String(product.compareAtPricePaise / 100) : '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || '');
  const [imageAlt, setImageAlt] = useState(product?.imageAlt || '');
  const [compatibility, setCompatibility] = useState(product?.compatibility.join(', ') || '');
  const [stock, setStock] = useState(String(product?.stockQuantity ?? 0));
  const [featured, setFeatured] = useState(product?.featured || false);
  const [published, setPublished] = useState(product?.published ?? true);
  const [selectedCollections, setSelectedCollections] = useState(product?.collections.map((c) => c.id) || []);
  const mutation = product ? update : create;
  const busy = create.isPending || update.isPending;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data: ProductInput = { name: name.trim(), slug: slugify(slug), description: description.trim() || null, category: category.trim(), pricePaise: Math.round(Number(price) * 100), compareAtPricePaise: compare ? Math.round(Number(compare) * 100) : null, imageUrl: imageUrl.trim() || null, imageAlt: imageAlt.trim() || null, compatibility: compatibility.split(',').map((s) => s.trim()).filter(Boolean), stockQuantity: Math.max(0, Number(stock)), featured, published, collectionIds: selectedCollections };
    const callbacks = { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListAdminCollectionsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() }); if (product) void queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(product.slug) }); void queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(slugify(slug)) }); onClose(); }, onError: () => window.alert('We couldn’t save this product. Please check the fields and try again.') };
    if (product) update.mutate({ id: product.id, data }, callbacks);
    else create.mutate({ data }, callbacks);
  }
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><form className="admin-modal admin-form-modal" onSubmit={submit}>
    <div className="modal-heading"><div><span className="eyebrow">Catalogue</span><h2>{product ? 'Edit product' : 'Add a product'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close form"><X /></button></div>
    <div className="form-grid">
      <label className="span-two">Product name<input className="field" required maxLength={140} value={name} onChange={(e) => { setName(e.target.value); if (!product) setSlug(slugify(e.target.value)); }} /></label>
      <label>URL slug<input className="field" required maxLength={160} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} /></label><label>Category<input className="field" required maxLength={80} value={category} onChange={(e) => setCategory(e.target.value)} /></label>
      <label>Price (INR)<input className="field" required min="0" step="0.01" type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></label><label>Compare-at price (INR)<input className="field" min="0" step="0.01" type="number" value={compare} onChange={(e) => setCompare(e.target.value)} /></label>
      <label>Stock quantity<input className="field" min="0" step="1" type="number" required value={stock} onChange={(e) => setStock(e.target.value)} /></label><label>Compatibility, comma separated<input className="field" value={compatibility} onChange={(e) => setCompatibility(e.target.value)} placeholder="Device model" /></label>
      <label className="span-two">Image URL<input className="field" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" /></label><label className="span-two">Image alt text<input className="field" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} /></label>
      <label className="span-two">Description<textarea className="field form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></label>
      <fieldset className="span-two collection-checks"><legend>Collections</legend>{collections.data?.length ? collections.data.map((c) => <label key={c.id} className="check-row"><input type="checkbox" checked={selectedCollections.includes(c.id)} onChange={(e) => setSelectedCollections((v) => e.target.checked ? [...v, c.id] : v.filter((id) => id !== c.id))} />{c.name}</label>) : <small>No collections are listed yet.</small>}</fieldset>
      <label className="check-row"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />Feature in the edit</label><label className="check-row"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />Published on storefront</label>
    </div>
    <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy}>{busy && <LoaderCircle size={16} className="spin" />}{product ? 'Save changes' : 'Create product'}</button></div>
  </form></div>;
}
function AdminProducts() {
  const query = useListAdminProducts();
  const queryClient = useQueryClient();
  const remove = useDeleteProduct();
  const [editing, setEditing] = useState<AdminProduct | undefined>();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = (query.data || []).filter((p) => `${p.name} ${p.category} ${p.slug}`.toLowerCase().includes(search.toLowerCase()));
  return <AdminFrame title="Products" subtitle="The details people use to find the right fit."><div className="admin-toolbar"><label className="admin-search"><Search size={17} /><input aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" /></label><button className="button-primary" onClick={() => setCreating(true)}><Plus size={16} /> Add product</button></div>
    <AdminQueryState loading={query.isLoading} error={query.isError} errorValue={query.error} retry={() => void query.refetch()}>{filtered.length ? <div className="table-shell"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Visibility</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((p) => <tr key={p.id} data-testid={`row-product-${p.id}`}><td><div className="table-product"><ProductImage product={p} compact /><span><b>{p.name}</b><small>{p.slug}</small></span></div></td><td>{p.category}</td><td>{money(p.pricePaise)}</td><td><span className="stock-cell">{p.stockQuantity} {p.stockQuantity === 1 ? 'unit' : 'units'}</span></td><td><span className={`status-pill ${p.published ? 'status-good' : 'status-draft'}`}><i />{p.published ? 'Published' : 'Draft'}</span></td><td><div className="table-actions"><button onClick={() => setEditing(p)}>Edit</button><button className="delete-action" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${p.name}? This cannot be undone.`)) remove.mutate({ id: p.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(p.slug) }); void queryClient.invalidateQueries({ queryKey: getListAdminCollectionsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() }); }, onError: () => window.alert('We couldn’t delete this product. Please try again.') }); }}>Delete</button></div></td></tr>)}</tbody></table></div> : <div className="state-card empty-state"><h3>{query.data?.length ? 'No products match that search.' : 'Your catalogue starts here.'}</h3><p>Add products to make them available to the storefront.</p><button className="button-primary" onClick={() => setCreating(true)}><Plus size={15} /> Add product</button></div>}</AdminQueryState>
    {(editing || creating) && <ProductForm product={editing} onClose={() => { setEditing(undefined); setCreating(false); }} />}
  </AdminFrame>;
}
function CollectionForm({ collection, close }: { collection?: { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; imageAlt: string | null; published: boolean }; close: () => void }) {
  const client = useQueryClient();
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const [name, setName] = useState(collection?.name || '');
  const [slug, setSlug] = useState(collection?.slug || '');
  const [description, setDescription] = useState(collection?.description || '');
  const [imageUrl, setImageUrl] = useState(collection?.imageUrl || '');
  const [imageAlt, setImageAlt] = useState(collection?.imageAlt || '');
  const [published, setPublished] = useState(collection?.published ?? true);
  const busy = create.isPending || update.isPending;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = { name: name.trim(), slug: slugify(slug), description: description.trim() || null, imageUrl: imageUrl.trim() || null, imageAlt: imageAlt.trim() || null, published };
    const callbacks = { onSuccess: () => { void client.invalidateQueries({ queryKey: getListAdminCollectionsQueryKey() }); void client.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); void client.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }); void client.invalidateQueries({ queryKey: getListProductsQueryKey() }); close(); }, onError: () => window.alert('We couldn’t save this collection. Please try again.') };
    if (collection) update.mutate({ id: collection.id, data }, callbacks); else create.mutate({ data }, callbacks);
  }
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><form className="admin-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">Storefront edit</span><h2>{collection ? 'Edit collection' : 'New collection'}</h2></div><button className="icon-button" type="button" onClick={close} aria-label="Close"><X /></button></div>
    <div className="form-grid"><label>Collection name<input className="field" required maxLength={120} value={name} onChange={(e) => { setName(e.target.value); if (!collection) setSlug(slugify(e.target.value)); }} /></label><label>URL slug<input className="field" required maxLength={140} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} /></label><label className="span-two">Description<textarea rows={3} className="field form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></label><label className="span-two">Image URL<input type="url" className="field" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" /></label><label className="span-two">Image alt text<input className="field" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} /></label><label className="check-row"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />Published on storefront</label></div>
    <div className="modal-actions"><button type="button" className="button-secondary" onClick={close}>Cancel</button><button className="button-primary" disabled={busy}>{busy && <LoaderCircle size={15} className="spin" />}{collection ? 'Save collection' : 'Create collection'}</button></div>
  </form></div>;
}
function AdminCollections() {
  const query = useListAdminCollections();
  const client = useQueryClient();
  const remove = useDeleteCollection();
  const [editing, setEditing] = useState<Parameters<typeof CollectionForm>[0]['collection']>();
  const [creating, setCreating] = useState(false);
  return <AdminFrame title="Collections" subtitle="Group the catalogue into clear, easy-to-browse edits."><div className="admin-toolbar"><p className="toolbar-caption">Collections are visible on the store when published.</p><button className="button-primary" onClick={() => setCreating(true)}><Plus size={16} /> Add collection</button></div>
    <AdminQueryState loading={query.isLoading} error={query.isError} errorValue={query.error} retry={() => void query.refetch()}>{query.data?.length ? <div className="collection-admin-grid">{query.data.map((c) => <article className="collection-admin-card" key={c.id}><div className="collection-admin-image">{c.imageUrl ? <img src={c.imageUrl} alt={c.imageAlt || c.name} /> : <div className="admin-image-empty"><Sparkles size={22} /><span>No collection image</span></div>}<span className={`status-pill ${c.published ? 'status-good' : 'status-draft'}`}><i />{c.published ? 'Published' : 'Draft'}</span></div><div className="collection-admin-copy"><span className="eyebrow">{c.productCount} products</span><h2>{c.name}</h2><p>{c.description || 'No description added yet.'}</p><div className="collection-admin-actions"><button className="button-secondary" onClick={() => setEditing(c)}>Edit details</button><Link href={`/collections/${c.slug}`}>View collection <ArrowUpRight size={14} /></Link><button className="delete-action" onClick={() => { if (window.confirm(`Delete the ${c.name} collection?`)) remove.mutate({ id: c.id }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getListAdminCollectionsQueryKey() }); void client.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); void client.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }); void client.invalidateQueries({ queryKey: getListProductsQueryKey() }); }, onError: () => window.alert('We couldn’t delete this collection. Please try again.') }); }}>Delete</button></div></div></article>)}</div> : <div className="state-card empty-state"><h3>No collections yet.</h3><p>Bring related products together when you’re ready.</p><button className="button-primary" onClick={() => setCreating(true)}><Plus size={15} /> Add collection</button></div>}</AdminQueryState>
    {(editing || creating) && <CollectionForm collection={editing} close={() => { setEditing(undefined); setCreating(false); }} />}
  </AdminFrame>;
}
function AdminHomepage() {
  const query = useGetAdminHomeContent();
  const update = useUpdateHomeContent();
  const client = useQueryClient();
  const [announcement, setAnnouncement] = useState('');
  const [trustItems, setTrustItems] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (query.data && !ready) { setAnnouncement(query.data.announcement || ''); setTrustItems(query.data.trustItems); setReady(true); } }, [query.data, ready]);
  return <AdminFrame title="Homepage" subtitle="Set the short pieces of copy that greet people at the door."><AdminQueryState loading={query.isLoading} error={query.isError} errorValue={query.error} retry={() => void query.refetch()}><form className="admin-panel content-editor" onSubmit={(e) => { e.preventDefault(); update.mutate({ data: { announcement: announcement.trim() || null, trustItems: trustItems.map((x) => x.trim()).filter(Boolean) } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetAdminHomeContentQueryKey() }); void client.invalidateQueries({ queryKey: getGetHomeContentQueryKey() }); }, onError: () => window.alert('We couldn’t save the homepage content.') }); }}>
    <div className="panel-heading"><div><span className="eyebrow">Storefront copy</span><h2>First things first</h2></div></div><label>Announcement, optional<input className="field" maxLength={160} value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="A short, honest note at the top of the page" /></label>
    <div className="trust-item-editor"><div><h3>Small notes of reassurance</h3><p>These appear below the homepage introduction.</p></div>{trustItems.map((item, i) => <label key={i}>Note {i + 1}<div className="trust-edit-line"><input className="field" maxLength={100} value={item} onChange={(e) => setTrustItems((v) => v.map((x, index) => index === i ? e.target.value : x))} /><button type="button" className="icon-button" aria-label={`Remove note ${i + 1}`} onClick={() => setTrustItems((v) => v.filter((_, index) => index !== i))}><X size={17} /></button></div></label>)}<button type="button" className="button-secondary add-note" disabled={trustItems.length >= 8} onClick={() => setTrustItems((v) => [...v, ''])}><Plus size={15} /> Add a note</button></div>
    <div className="admin-form-footer"><span>Changes appear on the public homepage.</span><button className="button-primary" disabled={update.isPending}>{update.isPending && <LoaderCircle size={15} className="spin" />}Save homepage copy</button></div>
  </form></AdminQueryState></AdminFrame>;
}
function AdminOrders() {
  const query = useListAdminOrders();
  const products = useListAdminProducts();
  const create = useCreateAdminOrder();
  const update = useUpdateOrder();
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [items, setItems] = useState<OrderLineInput[]>([{ productId: '', quantity: 1 }]);
  const [error, setError] = useState('');
  function record(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length || items.some((item) => !item.productId)) { setError('Choose a catalogue item for each order line.'); return; }
    create.mutate({ data: { customerName: name.trim(), customerEmail: email.trim(), customerPhone: phone.trim() || null, shippingAddress: address.trim(), items } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() }); void client.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }); setShowForm(false); setName(''); setEmail(''); setPhone(''); setAddress(''); setItems([{ productId: '', quantity: 1 }]); setError(''); }, onError: () => setError('We couldn’t record this order. Check the details and try again.') });
  }
  const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
  return <AdminFrame title="Orders received elsewhere." subtitle="Keep track of orders recorded by your team outside this website."><div className="orders-intro"><span><CircleAlert size={17} /> These orders are staff-recorded. The storefront does not take checkout or payment.</span><button className="button-primary" onClick={() => setShowForm((v) => !v)}><Plus size={16} /> Record an order</button></div>
    <AdminQueryState loading={query.isLoading} error={query.isError} errorValue={query.error} retry={() => void query.refetch()}>{query.data?.length ? <div className="table-shell"><table className="admin-table orders-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Received</th><th>Status</th></tr></thead><tbody>{query.data.map((order) => <tr key={order.id}><td><b>{order.orderNumber}</b><small className="table-subline">{order.id}</small></td><td><b>{order.customerName}</b><small>{order.customerEmail}</small></td><td>{order.itemCount}</td><td>{money(order.amountPaise)}</td><td>{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><select className={`status-select status-${order.status}`} aria-label={`Update status for ${order.orderNumber}`} value={order.status} disabled={update.isPending} onChange={(e) => update.mutate({ id: order.id, data: { status: e.target.value as StoreOrder['status'] } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() }); void client.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }); }, onError: () => window.alert('We couldn’t update this order status.') })}>{statusOptions.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></td></tr>)}</tbody></table></div> : <div className="state-card empty-state"><h3>No orders recorded yet.</h3><p>Record an order when your team receives one outside the website.</p><button className="button-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Record an order</button></div>}</AdminQueryState>
    {showForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}><form className="admin-modal" onSubmit={record}><div className="modal-heading"><div><span className="eyebrow">Received outside the website</span><h2>Record an order</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close order form"><X /></button></div><p className="form-context">This records an order already received by your team. It does not take payment or create a customer checkout.</p><div className="form-grid"><label>Customer name<input className="field" required maxLength={140} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email address<input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Phone, optional<input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} /></label><div className="span-two order-lines-editor"><div className="order-lines-heading"><strong>Order items</strong><button type="button" className="button-secondary" disabled={items.length >= 20} onClick={() => setItems((current) => [...current, { productId: '', quantity: 1 }])}><Plus size={14} /> Add another item</button></div>{items.map((item, index) => <div className="order-line-fields" key={index}><label>Catalogue item<select className="field" required value={item.productId} onChange={(e) => setItems((current) => current.map((line, i) => i === index ? { ...line, productId: e.target.value } : line))}><option value="">Choose a product</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.pricePaise)}</option>)}</select></label><label>Quantity<input className="field" type="number" min={1} max={99} value={item.quantity} onChange={(e) => setItems((current) => current.map((line, i) => i === index ? { ...line, quantity: Number(e.target.value) } : line))} /></label>{items.length > 1 && <button type="button" className="icon-button order-line-remove" aria-label={`Remove order item ${index + 1}`} onClick={() => setItems((current) => current.filter((_, i) => i !== index))}><Trash2 size={15} /></button>}</div>)}</div><label className="span-two">Shipping address<textarea className="field form-textarea" required maxLength={1000} rows={3} value={address} onChange={(e) => setAddress(e.target.value)} /></label></div>{error && <Notice kind="error">{error}</Notice>}<div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button-primary" disabled={create.isPending}>{create.isPending && <LoaderCircle size={15} className="spin" />}Record order</button></div></form></div>}
  </AdminFrame>;
}

function AdminRoute({ page }: { page: 'overview' | 'products' | 'collections' | 'homepage' | 'orders' }) {
  const pageContent = page === 'overview' ? <AdminOverview /> : page === 'products' ? <AdminProducts /> : page === 'collections' ? <AdminCollections /> : page === 'homepage' ? <AdminHomepage /> : <AdminOrders />;
  return <StaffOnly>{pageContent}</StaffOnly>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  useEffect(() => {
    let previous: string | null | undefined;
    const unsubscribe = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (previous !== undefined && previous !== id) client.clear();
      previous = id;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}
function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={HomePage} />
    <Route path="/products" component={CatalogPage} />
    <Route path="/products/:slug" component={ProductPage} />
    <Route path="/collections/:slug" component={CollectionPage} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/admin" component={() => <AdminRoute page="overview" />} />
    <Route path="/admin/products" component={() => <AdminRoute page="products" />} />
    <Route path="/admin/collections" component={() => <AdminRoute page="collections" />} />
    <Route path="/admin/homepage" component={() => <AdminRoute page="homepage" />} />
    <Route path="/admin/orders" component={() => <AdminRoute page="orders" />} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Your saved picks are right where you left them.' } }, signUp: { start: { title: 'Make it a little more you', subtitle: 'Create your CaseSolution4U account.' } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><TooltipProvider><ClerkQueryClientCacheInvalidator /><CartProvider><Router /></CartProvider><Toaster /></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

export default App;
