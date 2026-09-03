import { notFound } from 'next/navigation';
import { getPostBySlug, toPublicPost } from '@/server-lib/posts-repo';
import { pdfPageImages } from '@/server-lib/cloudinary';
import { SITE_NAME, absoluteUrl } from '@/lib/site';
import BlogPostView from '@/views/BlogPostView';

/* Server component: the article's semantic HTML and its structured data are
   rendered into the response, so the post is crawlable and shareable without
   running any JavaScript — including a Canva post, whose visible body is a
   stack of page images. Writes call revalidatePath, so this window only
   matters for out-of-band edits. */
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

/** schema.org wants absolute URLs; stored images may be site-relative. */
const absoluteImage = (src) =>
  !src ? null : src.startsWith('http') ? src : absoluteUrl(src);

/**
 * The image that represents the post when it is shared or listed.
 *
 * A Canva post often has no separate cover: its own first page is the truest
 * preview of the article, so fall back to that rather than to nothing.
 */
function socialImage(post, pages) {
  return absoluteImage(post.cover_image) || pages[0]?.src || null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: 'Post not found' };

  const title = post.seo_title || post.title;
  const description = describe(post);
  const url = absoluteUrl(`/blog/${post.slug}`);
  const image = socialImage(post, pdfPageImages(post.document_public_id, post.document_page_count));
  const published = post.published_at || post.created_at;

  return {
    title,
    description,
    alternates: { canonical: url },
    authors: [{ name: SITE_NAME, url: absoluteUrl('/') }],
    // The article is a picture of a document for most of its height; a large
    // image preview is what actually represents it in search results.
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      siteName: SITE_NAME,
      section: post.category || undefined,
      authors: [SITE_NAME],
      publishedTime: published ? new Date(published).toISOString() : undefined,
      modifiedTime: post.updated_at ? new Date(post.updated_at).toISOString() : undefined,
      images: image ? [{ url: image, alt: post.title }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function BlogPostRoute({ params }) {
  const { slug } = await params;
  const row = await getPostBySlug(slug);
  if (!row) notFound();

  const post = toPublicPost(row);
  const documentPages = pdfPageImages(row.document_public_id, row.document_page_count);
  const url = absoluteUrl(`/blog/${post.slug}`);
  const published = post.published_at || post.created_at;
  const image = socialImage(post, documentPages);

  /* The article's own words. For a Canva post they are the text extracted
     from the PDF — the same content the page carries as the design's text
     alternative, so the structured data describes what is really on the page
     rather than a separate summary written for crawlers. */
  const body = row.content_type === 'canva_pdf'
    ? String(row.extracted_text || '').trim() || plain(row.content)
    : plain(row.content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    alternativeHeadline: post.seo_title && post.seo_title !== post.title ? post.seo_title : undefined,
    description: describe(row),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    inLanguage: 'en',
    isAccessibleForFree: true,
    datePublished: published,
    dateModified: post.updated_at || published,
    articleSection: post.category || undefined,
    articleBody: body || undefined,
    wordCount: body ? body.split(/\s+/).filter(Boolean).length : undefined,
    image: image ? [image] : undefined,
    author: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      logo: { '@type': 'ImageObject', url: absoluteUrl('/logo.png') },
    },
  };

  // Matches the breadcrumb the page actually shows above the title.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: absoluteUrl('/blog') },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Escaped so the payload can't terminate the script tag early.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([jsonLd, breadcrumbLd]).replace(/</g, '\\u003c'),
        }}
      />
      <BlogPostView post={post} documentPages={documentPages} />
    </>
  );
}
