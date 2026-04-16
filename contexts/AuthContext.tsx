"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createUser, getUser } from "@/lib/firestore";
import type { AppUser } from "@/types";

// ─── Preview / Demo user (local development only) ────────────────────────────
const PREVIEW_USER: AppUser = {
  uid: "preview-user",
  email: "preview@golfcaddy.io",
  displayName: "Paul (Preview)",
  role: "admin",
  status: "active",
  groupId: "fourplay",
  avatarUrl: null,
  fcmToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
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
    options?: { groupId?: string; inviteId?: string }
  ) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  enterPreviewMode: () => void;
  isAdmin: boolean;
  isActive: boolean;
  isPending: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fallback: if Firebase doesn't respond in 5s (e.g. no config), stop loading
    const timeout = setTimeout(() => setLoading(false), 5000);

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(timeout);
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const user = await getUser(fbUser.uid);
          setAppUser(user);
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
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    options?: { groupId?: string; inviteId?: string }
  ) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await createUser(user.uid, {
      email,
      displayName,
      role: "member",
      status: "pending",
      groupId: options?.groupId ?? "fourplay",
      ...(options?.inviteId ? { inviteId: options.inviteId } : {}),
      avatarUrl: null,
      fcmToken: null,
    });
    // Reload appUser
    const newUser = await getUser(user.uid);
    setAppUser(newUser);
  };

  const signOut = async () => {
    await firebaseSignOut(auth).catch(() => {});
    setAppUser(null);
    setFirebaseUser(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const enterPreviewMode = () => {
    setAppUser(PREVIEW_USER);
    setLoading(false);
  };

  const isAdmin = appUser?.role === "admin";
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
        enterPreviewMode,
        isAdmin,
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
