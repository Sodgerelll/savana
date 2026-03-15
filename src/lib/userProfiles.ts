import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export type UserAuthMethod = "email" | "google" | "facebook" | "phone" | "guest" | "unknown";
export type UserRole = "customer" | "admin" | "sysadmin";

export interface UserProfile {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  role: UserRole;
  registrationMethod: UserAuthMethod;
  lastAuthMethod: UserAuthMethod;
  providers: string[];
  hasPassword: boolean;
  phoneLoginEmail: string | null;
  registeredAt: string | null;
  lastSignInAt: string | null;
}

const USER_SCHEMA_VERSION = 1;
const usersRef = collection(db, "users");

function parseConfigList(value: string | undefined, normalize: (item: string) => string = (item) => item.trim().toLowerCase()) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => normalize(item))
      .filter(Boolean),
  );
}

const sysadminUids = parseConfigList(import.meta.env.VITE_SYSADMIN_UIDS, (item) => item.trim());
const adminUids = parseConfigList(import.meta.env.VITE_ADMIN_UIDS, (item) => item.trim());
const sysadminEmails = parseConfigList(import.meta.env.VITE_SYSADMIN_EMAILS);
const adminEmails = parseConfigList(import.meta.env.VITE_ADMIN_EMAILS);
const sysadminPhones = parseConfigList(import.meta.env.VITE_SYSADMIN_PHONES, (item) => normalizePhoneNumber(item) ?? "");
const adminPhones = parseConfigList(import.meta.env.VITE_ADMIN_PHONES, (item) => normalizePhoneNumber(item) ?? "");

function normalizePhoneNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const hasPlusPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return `${hasPlusPrefix ? "+" : "+"}${digits}`;
}

function mapProviderIdToAuthMethod(providerId: string): UserAuthMethod {
  switch (providerId) {
    case "password":
      return "email";
    case "google.com":
      return "google";
    case "facebook.com":
      return "facebook";
    case "phone":
      return "phone";
    default:
      return "unknown";
  }
}

function getProviderIds(user: User) {
  if (user.isAnonymous) {
    return ["anonymous"];
  }

  const ids = user.providerData.map((provider) => provider.providerId).filter(Boolean);

  return ids.length > 0 ? ids : ["password"];
}

function deriveAuthMethod(user: User) {
  if (user.isAnonymous) {
    return "guest";
  }

  const [primaryProvider] = getProviderIds(user);
  return mapProviderIdToAuthMethod(primaryProvider ?? "unknown");
}

function deserializeUserProfile(snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>) {
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as Record<string, unknown>;

  return {
    uid: String(data.uid ?? snapshot.id),
    email: typeof data.email === "string" ? data.email : null,
    phoneNumber: typeof data.phoneNumber === "string" ? data.phoneNumber : null,
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    role: data.role === "sysadmin" || data.role === "admin" ? data.role : "customer",
    registrationMethod:
      data.registrationMethod === "email" ||
      data.registrationMethod === "google" ||
      data.registrationMethod === "facebook" ||
      data.registrationMethod === "phone" ||
      data.registrationMethod === "guest"
        ? data.registrationMethod
        : "unknown",
    lastAuthMethod:
      data.lastAuthMethod === "email" ||
      data.lastAuthMethod === "google" ||
      data.lastAuthMethod === "facebook" ||
      data.lastAuthMethod === "phone" ||
      data.lastAuthMethod === "guest"
        ? data.lastAuthMethod
        : "unknown",
    providers: Array.isArray(data.providers) ? data.providers.map((provider) => String(provider)) : [],
    hasPassword: Boolean(data.hasPassword),
    phoneLoginEmail: typeof data.phoneLoginEmail === "string" ? data.phoneLoginEmail : null,
    registeredAt: typeof data.registeredAt === "string" ? data.registeredAt : null,
    lastSignInAt: typeof data.lastSignInAt === "string" ? data.lastSignInAt : null,
  } satisfies UserProfile;
}

export function createPhoneLoginEmail(phoneNumber: string) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    throw new Error("A valid phone number is required to generate a phone login email.");
  }

  return `phone.${normalizedPhoneNumber.replace(/^\+/, "")}@auth.savana.local`;
}

export function isPrivilegedRole(role: UserRole) {
  return role === "admin" || role === "sysadmin";
}

export function resolveUserRole(identity: {
  uid?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  role?: UserRole | null;
}) {
  if (identity.role === "sysadmin" || identity.role === "admin") {
    return identity.role;
  }

  if (
    (identity.uid && sysadminUids.has(identity.uid)) ||
    (identity.email && sysadminEmails.has(identity.email.toLowerCase())) ||
    (identity.phoneNumber && sysadminPhones.has(normalizePhoneNumber(identity.phoneNumber) ?? ""))
  ) {
    return "sysadmin";
  }

  if (
    (identity.uid && adminUids.has(identity.uid)) ||
    (identity.email && adminEmails.has(identity.email.toLowerCase())) ||
    (identity.phoneNumber && adminPhones.has(normalizePhoneNumber(identity.phoneNumber) ?? ""))
  ) {
    return "admin";
  }

  return "customer";
}

export async function getUserProfile(uid: string) {
  const snapshot = await getDoc(doc(usersRef, uid));
  return deserializeUserProfile(snapshot);
}

export async function findUserProfileByPhone(phoneNumber: string) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    return null;
  }

  const snapshots = await getDocs(query(usersRef, where("phoneNumber", "==", normalizedPhoneNumber), limit(1)));
  const [snapshot] = snapshots.docs;

  return snapshot ? deserializeUserProfile(snapshot) : null;
}

export async function syncUserProfile(
  user: User,
  options: {
    currentMethod?: UserAuthMethod;
    registrationMethod?: UserAuthMethod;
    hasPassword?: boolean;
    phoneLoginEmail?: string | null;
  } = {},
) {
  if (user.isAnonymous) {
    return null;
  }

  const ref = doc(usersRef, user.uid);
  const snapshot = await getDoc(ref);
  const existingProfile = deserializeUserProfile(snapshot);
  const providers = Array.from(new Set([...getProviderIds(user), ...(existingProfile?.providers ?? [])])).filter(
    (provider) => provider !== "anonymous",
  );
  const currentMethod = options.currentMethod ?? deriveAuthMethod(user);

  const nextProfile: UserProfile = {
    uid: user.uid,
    email: user.email ?? existingProfile?.email ?? null,
    phoneNumber: normalizePhoneNumber(user.phoneNumber) ?? existingProfile?.phoneNumber ?? null,
    displayName: user.displayName ?? existingProfile?.displayName ?? null,
    role: existingProfile?.role ?? "customer",
    registrationMethod: existingProfile?.registrationMethod ?? options.registrationMethod ?? currentMethod,
    lastAuthMethod: currentMethod,
    providers,
    hasPassword: options.hasPassword ?? existingProfile?.hasPassword ?? providers.includes("password"),
    phoneLoginEmail: options.phoneLoginEmail ?? existingProfile?.phoneLoginEmail ?? null,
    registeredAt: existingProfile?.registeredAt ?? user.metadata.creationTime ?? null,
    lastSignInAt: user.metadata.lastSignInTime ?? existingProfile?.lastSignInAt ?? null,
  };

  await setDoc(
    ref,
    {
      ...nextProfile,
      schemaVersion: USER_SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
      ...(snapshot.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );

  return nextProfile;
}

export function subscribeToUserProfiles({
  onData,
  onError,
}: {
  onData: (profiles: UserProfile[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(usersRef),
    (snapshot) => {
      const profiles = snapshot.docs
        .map((documentSnapshot) => deserializeUserProfile(documentSnapshot))
        .filter((profile): profile is UserProfile => profile !== null)
        .sort((left, right) => {
          const leftValue = left.displayName ?? left.email ?? left.phoneNumber ?? left.uid;
          const rightValue = right.displayName ?? right.email ?? right.phoneNumber ?? right.uid;
          return leftValue.localeCompare(rightValue);
        });

      onData(profiles);
    },
    onError,
  );
}
