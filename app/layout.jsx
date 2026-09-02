import Script from 'next/script';
import Providers from './providers';
import { SITE_URL } from '@/lib/site';

// Global stylesheets — same files, same order as the old src/main.jsx.
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/navbar.css';
import '@/styles/hero.css';
import '@/styles/marquee.css';
import '@/styles/services.css';
import '@/styles/approach.css';
import '@/styles/process.css';
import '@/styles/stories.css';
import '@/styles/faq.css';
import '@/styles/cta.css';
import '@/styles/footer.css';
import '@/styles/about.css';
import '@/styles/practice.css';
import '@/styles/contact.css';
import '@/styles/blog.css';
import '@/styles/origin.css';
import '@/styles/leadmagnet.css';
import '@/styles/chat.css';
import '@/styles/blog-editor.css';
import '@/styles/responsive.css';

export const metadata = {
  // Resolves relative Open Graph / Twitter image paths to absolute URLs.
  metadataBase: new URL(SITE_URL),
  title: 'Ananta Legal — Startup & Business Law, Kathmandu',
  description:
    'Plain-English legal for founders. Company formation, contracts, fundraising, IP and compliance — handled at startup speed, from Kathmandu, Nepal.',
  icons: { icon: [{ url: '/logo.png', type: 'image/png' }] },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint (no flash). */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('el-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}`}
        </Script>

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />

        {/* Google tag (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-CCNZ71KWVM"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-CCNZ71KWVM');`}
        </Script>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
