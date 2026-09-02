import { getPublishedSlugs } from '@/server-lib/posts-repo';
import { SITE_URL } from '@/lib/site';

export const revalidate = 3600;

const STATIC_ROUTES = [
  { path: '/', priority: 1.0, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/practice-areas', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/our-story', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/blog', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/contact', priority: 0.7, changeFrequency: 'yearly' },
  { path: '/guide', priority: 0.6, changeFrequency: 'yearly' },
];

const PRACTICE_SLUGS = [
  'company-formation',
  'contracts',
  'fundraising-investment',
  'intellectual-property',
  'compliance-governance',
  'exits-disputes',
];

export default async function sitemap() {
  const now = new Date();

  const entries = [
    ...STATIC_ROUTES.map((r) => ({
      url: `${SITE_URL}${r.path}`,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...PRACTICE_SLUGS.map((slug) => ({
      url: `${SITE_URL}/practice-areas/${slug}`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.7,
    })),
  ];

  for (const post of await getPublishedSlugs()) {
    entries.push({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at || post.published_at || post.created_at || now),
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  return entries;
}
