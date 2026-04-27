import { redirect } from 'next/navigation';

/**
 * Customer login moved to /account/login (T56). This stub keeps any
 * old bookmarks / external links pointing at /login working.
 */
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : '/account';
  redirect(`/account/login?next=${encodeURIComponent(next)}`);
}
