import { notFound } from 'next/navigation';
import { getPostBySlug, toPublicPost } from '@/server-lib/posts-repo';
import { pdfPageUrl } from '@/server-lib/cloudinary';
import { SITE_NAME, absoluteUrl } from '@/lib/site';
import BlogPostView from '@/views/BlogPostView';

/* Server component: the article HTML is rendered into the response, so the
   post is crawlable and shareable without running any JavaScript. Writes call
   revalidatePath, so this window only matters for out-of-band edits. */
export const revalidate = 300;

const plain = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function describe(post) {
  const text = post.seo_description || post.excerpt || plain(post.content).slice(0, 300);
  return text.length > 300 ? `${text.slice(0, 297).replace(/\s+\S*$/, '')}…` : text;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: 'Post not found' };

  const title = post.seo_title || post.title;
  const description = describe(post);
  const url = absoluteUrl(`/blog/${post.slug}`);
  const image = post.cover_image || null;
  const published = post.published_at || post.created_at;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      siteName: SITE_NAME,
      publishedTime: published ? new Date(published).toISOString() : undefined,
      modifiedTime: post.updated_at ? new Date(post.updated_at).toISOString() : undefined,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

/** Responsive Cloudinary page images for a Canva document. */
function documentPagesFor(post) {
  if (post.content_type !== 'canva_pdf' || !post.document_public_id) return [];
  const count = Math.min(Number(post.document_page_count) || 0, 60);
  return Array.from({ length: count }, (_, i) => {
    const page = i + 1;
    return {
      page,
      src: pdfPageUrl(post.document_public_id, page, 1200),
      srcSet: [740, 1200, 1600]
        .map((w) => `${pdfPageUrl(post.document_public_id, page, w)} ${w}w`)
        .join(', '),
    };
  });
}

export default async function BlogPostRoute({ params }) {
  const { slug } = await params;
  const row = await getPostBySlug(slug);
  if (!row) notFound();

  const post = toPublicPost(row);
  const url = absoluteUrl(`/blog/${post.slug}`);
  const published = post.published_at || post.created_at;
  // schema.org wants absolute URLs; cover images may be stored site-relative.
  const image = post.cover_image
    ? post.cover_image.startsWith('http')
      ? post.cover_image
      : absoluteUrl(post.cover_image)
    : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: describe(row),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    datePublished: published,
    dateModified: post.updated_at || published,
    articleSection: post.category || undefined,
    image: image ? [image] : undefined,
    author: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      logo: { '@type': 'ImageObject', url: absoluteUrl('/logo.png') },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Escaped so the payload can't terminate the script tag early.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <BlogPostView post={post} documentPages={documentPagesFor(post)} />
    </>
  );
}
