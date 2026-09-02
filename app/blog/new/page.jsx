'use client';

import dynamic from 'next/dynamic';

// The editor bundles TinyMCE and touches the DOM on load — client only.
const BlogEditorPage = dynamic(() => import('@/views/BlogEditorPage'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '60vh' }} />,
});

export default function Page() {
  return <BlogEditorPage />;
}
