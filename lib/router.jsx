'use client';

/**
 * react-router-dom -> Next.js compatibility shim.
 *
 * The migration keeps every component's JSX (and class names) untouched — the
 * only change in each file is the import path: `react-router-dom` -> `@/lib/router`.
 * These wrappers map the small router surface the app actually uses onto
 * `next/link` + `next/navigation`.
 */
import { forwardRef } from 'react';
import NextLink from 'next/link';
import { usePathname, useParams as useNextParams, useRouter } from 'next/navigation';

/** <Link to="/about"> -> <Link href="/about"> (all other props pass through). */
export const Link = forwardRef(function Link({ to, href, children, ...rest }, ref) {
  return (
    <NextLink ref={ref} href={to ?? href ?? '#'} {...rest}>
      {children}
    </NextLink>
  );
});

/** useLocation() -> { pathname }. The app only ever reads `.pathname`. */
export function useLocation() {
  const pathname = usePathname();
  return { pathname };
}

/** useParams() — same shape ({ slug }) as react-router for this app's routes. */
export function useParams() {
  return useNextParams();
}

/** useNavigate() -> (to) => router.push(to). */
export function useNavigate() {
  const router = useRouter();
  return (to, opts) => {
    if (typeof to === 'number') {
      // react-router allows navigate(-1); map the common case to browser back.
      if (to < 0) router.back();
      else router.forward();
      return;
    }
    if (opts?.replace) router.replace(to);
    else router.push(to);
  };
}
