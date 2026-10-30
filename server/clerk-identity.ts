import type { Identity } from "./planner-handler.ts";
import { ApiError } from "./http.ts";

export interface ClerkIdentityUser {
  id: string;
  externalId: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
}
export interface IdentityStore {
  lookup(subject: string): Promise<string | null>;
  existing(userId: string): Promise<{ email?: string } | null>;
  create(email: string): Promise<string>;
  link(subject: string, userId: string): Promise<void>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** User comes from Clerk's authenticated Backend API, never the request body. */
export async function resolveClerkIdentity(
  namespace: string,
  user: ClerkIdentityUser,
  store: IdentityStore,
): Promise<Identity> {
  const email = user.emailAddresses.find(
    (value) =>
      value.id === user.primaryEmailAddressId &&
      value.verification?.status === "verified",
  )?.emailAddress;
  if (!email)
    throw new ApiError(
      403,
      "email_unverified",
      "A verified account email is required.",
    );
  const subject = `${namespace}:${user.id}`;
  const mapped = await store.lookup(subject);
  if (mapped) {
    if (user.externalId && user.externalId !== mapped)
      throw new ApiError(
        403,
        "identity_conflict",
        "The account mapping needs operator review.",
      );
    return { userId: mapped, email };
  }
  let userId: string;
  if (user.externalId) {
    if (!uuid.test(user.externalId))
      throw new ApiError(
        403,
        "identity_conflict",
        "The account mapping needs operator review.",
      );
    const legacy = await store.existing(user.externalId);
    if (!legacy?.email || legacy.email.toLowerCase() !== email.toLowerCase())
      throw new ApiError(
        403,
        "identity_conflict",
        "The imported account needs operator review.",
      );
    userId = user.externalId;
  } else {
    try {
      userId = await store.create(email);
    } catch {
      // A simultaneous first login may already have finished provisioning.
      const concurrent = await store.lookup(subject);
      if (concurrent) return { userId: concurrent, email };
      // Never auto-link by email. An existing Supabase user must be imported
      // by the operator with its stable UUID in Clerk.externalId first.
      throw new ApiError(
        409,
        "identity_migration_required",
        "This account could not be provisioned. If you already used prune, ask the operator to migrate your existing account before signing in.",
      );
    }
  }
  await store.link(subject, userId);
  return { userId, email };
}
