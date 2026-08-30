"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  User as FirebaseUser,
  type ActionCodeSettings,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  createUser,
  getUser,
  markMemberInviteUsed,
  subscribeUser,
  updateUser,
} from "@/lib/firestore";
import { clearCurrentPushToken } from "@/lib/pushClient";
import type { AppUser, UserGender } from "@/types";

type SignUpOptions = {
  groupId?: string;
  inviteId?: string;
  nickname?: string | null;
  mobileNumber?: string | null;
  dateOfBirth?: string | null;
  gender?: UserGender | null;
  usesSeniorTees?: boolean;
  usesProBackTees?: boolean;
};

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    options?: SignUpOptions
  ) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  isAdmin: boolean;
  isModerator: boolean;
  canAccessAdmin: boolean;
  isActive: boolean;
  isPending: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  // undefined = onAuthStateChanged hasn't fired yet; null = signed out; string = uid
  const prevUidRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Fallback: if Firebase doesn't respond in 5s (e.g. no config), stop loading
    const timeout = setTimeout(() => setLoading(false), 5000);
    let unsubscribeUser: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(timeout);

      const prevUid = prevUidRef.current;
      const nextUid = fbUser?.uid ?? null;
      prevUidRef.current = nextUid;

      // Firebase fires onAuthStateChanged on silent token refreshes (every ~hour).
      // If the uid hasn't changed this is a token refresh — nothing to do.
      if (prevUid !== undefined && prevUid === nextUid) return;

      unsubscribeUser?.();
      unsubscribeUser = null;
      setLoading(true);
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const initialUser = await getUser(fbUser.uid);
          if (initialUser && fbUser.email && initialUser.email !== fbUser.email) {
            setAppUser({ ...initialUser, email: fbUser.email });
            updateUser(fbUser.uid, { email: fbUser.email }).catch((error) => {
              console.warn("Unable to sync email from auth user", error);
            });
          } else {
            setAppUser(initialUser);
          }
          unsubscribeUser = subscribeUser(
            fbUser.uid,
            setAppUser,
            () => setAppUser(null)
          );
        } catch {
          setAppUser(null);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribeUser?.();
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    options?: SignUpOptions
  ) => {
    setLoading(true);
    try {
      if (!options?.groupId) {
        throw new Error("A group must be selected to sign up.");
      }
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await createUser(user.uid, {
        email,
        displayName,
        role: "member",
        status: "pending",
        groupId: options.groupId,
        ...(options?.inviteId ? { inviteId: options.inviteId } : {}),
        nickname: options?.nickname ?? null,
        mobileNumber: options?.mobileNumber ?? null,
        dateOfBirth: options?.dateOfBirth ?? null,
        gender: options?.gender ?? null,
        usesSeniorTees: options?.usesSeniorTees ?? false,
        usesProBackTees: options?.usesProBackTees ?? false,
        avatarUrl: null,
        avatarPath: null,
        fcmToken: null,
      });
      if (options?.inviteId) {
        markMemberInviteUsed(options.inviteId).catch((error) => {
          console.warn("Unable to mark invite as used", error);
        });
      }
      // Keep appUser in sync immediately after signup.
      const newUser = await getUser(user.uid);
      setAppUser(newUser);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    if (appUser?.uid) {
      await clearCurrentPushToken().catch(() => {});
      await updateUser(appUser.uid, { fcmToken: null }).catch(() => {});
    }
    await firebaseSignOut(auth).catch(() => {});
    setAppUser(null);
    setFirebaseUser(null);
    setLoading(false);
  };

  // Send the reset email with a continue URL so the user lands back on
  // GolfCaddy after choosing a new password instead of a Firebase-branded page
  // on a domain they don't recognise. Firebase rejects continue URLs whose
  // domain isn't listed under Auth -> Settings -> Authorized domains, so fall
  // back to the default link rather than failing the send outright.
  const resetPassword = async (email: string) => {
    const settings: ActionCodeSettings = {
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://golfcaddy.club"}/signin`,
      handleCodeInApp: false,
    };

    try {
      await sendPasswordResetEmail(auth, email, settings);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (
        code !== "auth/unauthorized-continue-uri" &&
        code !== "auth/invalid-continue-uri"
      ) {
        throw error;
      }
      console.warn(
        `[auth] ${settings.url} is not an authorized domain in Firebase Auth. ` +
          "Add it under Authentication -> Settings -> Authorized domains. " +
          "Falling back to the default Firebase reset link."
      );
      await sendPasswordResetEmail(auth, email);
    }
  };

  const isAdmin = appUser?.role === "admin";
  const isModerator = appUser?.role === "moderator";
  const canAccessAdmin = isAdmin || isModerator;
  const isActive = appUser?.status === "active";
  const isPending = appUser?.status === "pending";

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        isAdmin,
        isModerator,
        canAccessAdmin,
        isActive,
        isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
