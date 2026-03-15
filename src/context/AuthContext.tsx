/* eslint-disable react-refresh/only-export-components */
import {
  EmailAuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  RecaptchaVerifier,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { auth } from "../lib/firebase";
import {
  createPhoneLoginEmail,
  getUserProfile,
  isPrivilegedRole,
  resolveUserRole,
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
  signInWithFacebook: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signInWithPhonePassword: (phoneNumber: string, password: string) => Promise<void>;
  requestPhoneCode: (phoneNumber: string, container: HTMLElement) => Promise<void>;
  confirmPhoneCode: (code: string, options?: { registrationPassword?: string }) => Promise<void>;
  resetPhoneSignIn: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });
facebookProvider.addScope("email");
facebookProvider.setCustomParameters({ display: "popup" });

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
  const phoneConfirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);

      if (!nextUser || nextUser.isAnonymous) {
        if (active) {
          setProfile(null);
        }
        return;
      }

      void getUserProfile(nextUser.uid)
        .then(async (existingProfile) => {
          if (!active) {
            return;
          }

          if (existingProfile) {
            setProfile(existingProfile);
            return;
          }

          const syncedProfile = await syncUserProfile(nextUser);

          if (active) {
            setProfile(syncedProfile);
          }
        })
        .catch(() => {
          if (active) {
            setProfile(null);
          }
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(
    () => () => {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      recaptchaContainerRef.current = null;
      phoneConfirmationRef.current = null;
    },
    [],
  );

  const enablePersistence = async () => {
    await setPersistence(auth, browserLocalPersistence);
  };

  const clearPhoneSignIn = () => {
    phoneConfirmationRef.current = null;
    recaptchaVerifierRef.current?.clear();
    recaptchaVerifierRef.current = null;
    recaptchaContainerRef.current = null;
  };

  const syncAndStoreProfile = async (
    authenticatedUser: User,
    options: {
      currentMethod?: UserAuthMethod;
      registrationMethod?: UserAuthMethod;
      hasPassword?: boolean;
      phoneLoginEmail?: string | null;
    } = {},
  ) => {
    const syncedProfile = await syncUserProfile(authenticatedUser, options);
    setProfile(syncedProfile);
    return syncedProfile;
  };

  const getRecaptchaVerifier = async (container: HTMLElement) => {
    if (recaptchaVerifierRef.current && recaptchaContainerRef.current === container) {
      return recaptchaVerifierRef.current;
    }

    clearPhoneSignIn();

    const verifier = new RecaptchaVerifier(auth, container, {
      size: "invisible",
    });

    recaptchaVerifierRef.current = verifier;
    recaptchaContainerRef.current = container;
    await verifier.render();

    return verifier;
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

  const signInWithFacebook = async () => {
    await enablePersistence();
    const credential = await signInWithPopup(auth, facebookProvider);
    await syncAndStoreProfile(credential.user, {
      currentMethod: "facebook",
      registrationMethod: "facebook",
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
    const credential = await signInWithEmailAndPassword(auth, createPhoneLoginEmail(phoneNumber), password);
    await syncAndStoreProfile(credential.user, {
      currentMethod: "phone",
      registrationMethod: "phone",
      hasPassword: true,
      phoneLoginEmail: createPhoneLoginEmail(phoneNumber),
    });
  };

  const requestPhoneCode = async (phoneNumber: string, container: HTMLElement) => {
    await enablePersistence();
    const verifier = await getRecaptchaVerifier(container);

    try {
      phoneConfirmationRef.current = await signInWithPhoneNumber(auth, phoneNumber, verifier);
    } catch (error) {
      clearPhoneSignIn();
      throw error;
    }
  };

  const confirmPhoneCode = async (code: string, options: { registrationPassword?: string } = {}) => {
    if (!phoneConfirmationRef.current) {
      throw createAuthError("auth/missing-verification-id", "Phone verification session is missing.");
    }

    const confirmationResult = phoneConfirmationRef.current;

    try {
      const credential = await confirmationResult.confirm(code);
      let phoneLoginEmail: string | null = null;
      let hasPassword = credential.user.providerData.some((provider) => provider.providerId === "password");

      if (options.registrationPassword) {
        const generatedEmail = createPhoneLoginEmail(credential.user.phoneNumber ?? "");

        try {
          await linkWithCredential(
            credential.user,
            EmailAuthProvider.credential(generatedEmail, options.registrationPassword),
          );
        } catch (linkError) {
          const linkErrorCode =
            typeof linkError === "object" &&
            linkError !== null &&
            "code" in linkError &&
            typeof linkError.code === "string"
              ? linkError.code
              : "";

          if (linkErrorCode !== "auth/provider-already-linked") {
            throw linkError;
          }
        }

        phoneLoginEmail = generatedEmail;
        hasPassword = true;
      }

      await syncAndStoreProfile(auth.currentUser ?? credential.user, {
        currentMethod: "phone",
        registrationMethod: "phone",
        hasPassword,
        phoneLoginEmail,
      });
      clearPhoneSignIn();
    } catch (error) {
      phoneConfirmationRef.current = confirmationResult;
      throw error;
    }
  };

  const logout = async () => {
    clearPhoneSignIn();
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
        signInWithFacebook,
        signInAsGuest,
        signInWithPhonePassword,
        requestPhoneCode,
        confirmPhoneCode,
        resetPhoneSignIn: clearPhoneSignIn,
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
