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
import { createUser, getUser, subscribeUser } from "@/lib/firestore";
import type { AppUser } from "@/types";

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

  useEffect(() => {
    // Fallback: if Firebase doesn't respond in 5s (e.g. no config), stop loading
    const timeout = setTimeout(() => setLoading(false), 5000);
    let unsubscribeUser: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(timeout);
      unsubscribeUser?.();
      unsubscribeUser = null;
      setLoading(true);
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const initialUser = await getUser(fbUser.uid);
          setAppUser(initialUser);
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
    options?: { groupId?: string; inviteId?: string }
  ) => {
    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await createUser(user.uid, {
        email,
        displayName,
        role: "member",
        status: "pending",
        groupId: options?.groupId ?? "fourplay",
        ...(options?.inviteId ? { inviteId: options.inviteId } : {}),
        avatarUrl: null,
        avatarPath: null,
        fcmToken: null,
      });
      // Keep appUser in sync immediately after signup.
      const newUser = await getUser(user.uid);
      setAppUser(newUser);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    await firebaseSignOut(auth).catch(() => {});
    setAppUser(null);
    setFirebaseUser(null);
    setLoading(false);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
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
