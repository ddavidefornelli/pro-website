/** Only a publishable key may enter the browser bundle. */
export function clerkOrigin(key: unknown): string | null {
  if (!key) return null;
  if (typeof key !== 'string' || !/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(key)) throw new Error('Use a Clerk publishable key, never a secret key.');
  let domain: string;
  try { domain = atob(key.split('_').slice(2).join('_').replace(/-/g, '+').replace(/_/g, '/')).replace(/\$$/, ''); }
  catch { throw new Error('The Clerk publishable key is invalid.'); }
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain) || !domain.includes('.') || domain.includes('..')) throw new Error('The Clerk publishable key has an invalid frontend domain.');
  return `https://${domain}`;
}
export function usesClerk(): boolean {
  return import.meta.env.VITE_AUTH_PROVIDER !== 'supabase' && !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
}
