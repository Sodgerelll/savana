/* eslint-disable react-refresh/only-export-components */
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth } from "../lib/firebase";
import {
  createPhoneLoginEmail,
  isPrivilegedRole,
  resolveUserRole,
  subscribeToUserProfile,
  syncUserProfile,
  type UserAuthMethod,
  type UserProfile,
  type UserRole,
} from "../lib/userProfiles";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole;
  authMethod: UserAuthMethod;
  isPrivilegedUser: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signInWithPhonePassword: (phoneNumber: string, password: string) => Promise<void>;
  signUpWithPhonePassword: (phoneNumber: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });

function createAuthError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function getDerivedAuthMethod(user: User | null, profile: UserProfile | null): UserAuthMethod {
  if (!user) {
    return "unknown";
  }

  if (user.isAnonymous) {
    return "guest";
  }

  return profile?.registrationMethod ?? "unknown";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!nextUser || nextUser.isAnonymous) {
        if (active) {
          setProfile(null);
        }
        return;
      }

      unsubscribeProfile = subscribeToUserProfile(nextUser.uid, {
        onData: (existingProfile) => {
          if (active) {
            if (existingProfile) {
              setProfile(existingProfile);
              return;
            }

            void syncUserProfile(nextUser)
              .then((syncedProfile) => {
                if (active) {
                  setProfile(syncedProfile);
                }
              })
              .catch(() => {
                if (active) {
                  setProfile(null);
                }
              });
          }
        },
        onError: () => {
          if (active) {
            setProfile(null);
          }
        },
      });
    });

    return () => {
      active = false;
      unsubscribeProfile?.();
      unsubscribe();
    };
  }, []);

  const enablePersistence = async () => {
    await setPersistence(auth, browserLocalPersistence);
  };

  const syncAndStoreProfile = async (
    authenticatedUser: User,
    options: {
      currentMethod?: UserAuthMethod;
      registrationMethod?: UserAuthMethod;
      hasPassword?: boolean;
      phoneLoginEmail?: string | null;
      phoneNumber?: string | null;
      email?: string | null;
    } = {},
  ) => {
    const syncedProfile = await syncUserProfile(authenticatedUser, options);
    setProfile(syncedProfile);
    return syncedProfile;
  };

  const getPhoneLoginEmail = (phoneNumber: string) => {
    try {
      return createPhoneLoginEmail(phoneNumber);
    } catch {
      throw createAuthError("auth/invalid-phone-number", "A valid phone number is required.");
    }
  };

  const signIn = async (email: string, password: string) => {
    await enablePersistence();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await syncAndStoreProfile(credential.user, {
      currentMethod: "email",
      registrationMethod: "email",
      hasPassword: true,
    });
  };

  const signUp = async (email: string, password: string) => {
    await enablePersistence();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await syncAndStoreProfile(credential.user, {
      currentMethod: "email",
      registrationMethod: "email",
      hasPassword: true,
    });
  };

  const signInWithGoogle = async () => {
    await enablePersistence();
    const credential = await signInWithPopup(auth, googleProvider);
    await syncAndStoreProfile(credential.user, {
      currentMethod: "google",
      registrationMethod: "google",
      hasPassword: credential.user.providerData.some((provider) => provider.providerId === "password"),
    });
  };

  const signInAsGuest = async () => {
    await enablePersistence();
    await signInAnonymously(auth);
    setProfile(null);
  };

  const signInWithPhonePassword = async (phoneNumber: string, password: string) => {
    await enablePersistence();
    const phoneLoginEmail = getPhoneLoginEmail(phoneNumber);
    const credential = await signInWithEmailAndPassword(auth, phoneLoginEmail, password);
    await syncAndStoreProfile(credential.user, {
      currentMethod: "phone",
      registrationMethod: "phone",
      hasPassword: true,
      phoneLoginEmail,
      phoneNumber,
      email: null,
    });
  };

  const signUpWithPhonePassword = async (phoneNumber: string, password: string) => {
    await enablePersistence();
    const phoneLoginEmail = getPhoneLoginEmail(phoneNumber);

    try {
      const credential = await createUserWithEmailAndPassword(auth, phoneLoginEmail, password);
      await syncAndStoreProfile(credential.user, {
        currentMethod: "phone",
        registrationMethod: "phone",
        hasPassword: true,
        phoneLoginEmail,
        phoneNumber,
        email: null,
      });
    } catch (error) {
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "";

      if (errorCode === "auth/email-already-in-use") {
        throw createAuthError("auth/phone-already-in-use", "This phone number is already registered.");
      }

      throw error;
    }
  };

  const logout = async () => {
    setProfile(null);
    await signOut(auth);
  };

  const role = resolveUserRole({
    uid: user?.uid,
    email: profile?.email ?? user?.email,
    phoneNumber: profile?.phoneNumber ?? user?.phoneNumber,
    role: profile?.role ?? null,
  });
  const authMethod = getDerivedAuthMethod(user, profile);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        authMethod,
        isPrivilegedUser: isPrivilegedRole(role),
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signInAsGuest,
        signInWithPhonePassword,
        signUpWithPhonePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
