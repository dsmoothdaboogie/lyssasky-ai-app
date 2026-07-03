import { useCallback, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../firebase/client';

export interface UseAdminAuth {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

/**
 * Admin auth for the `/admin` area. Uses the same Firebase `auth`
 * instance customers use for anonymous sign-in, but admins authenticate
 * with email/password. Admin privilege is a custom claim (`admin: true`)
 * rather than a Firestore role lookup, so it's readable straight off the
 * ID token — see functions/src/seed/seedAdmin.ts for how the claim gets
 * set in the emulator.
 */
export function useAdminAuth(): UseAdminAuth {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await nextUser.getIdTokenResult();
        setIsAdmin(tokenResult.claims.admin === true);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return { user, loading, isAdmin, signIn, signOut };
}
