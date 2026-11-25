import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onSessionExpired, setApiToken, tokenStore } from './api';
import type { Me } from './types';

interface Auth {
  ready: boolean;
  me: Me | null;
  signIn(token: string): Promise<Me>;
  signOut(): Promise<void>;
  refresh(): Promise<Me | null>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const signOut = useCallback(async () => {
    setApiToken(null);
    setMe(null);
    await tokenStore.clear();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>('/me');
      setMe(m);
      return m;
    } catch {
      return null;
    }
  }, []);

  const signIn = useCallback(async (token: string) => {
    setApiToken(token);
    await tokenStore.set(token);
    const m = await api<Me>('/me');
    setMe(m);
    return m;
  }, []);

  useEffect(() => {
    onSessionExpired(() => { void signOut(); });
    (async () => {
      const t = await tokenStore.get();
      if (t) {
        setApiToken(t);
        const m = await refresh();
        if (!m) await signOut();
      }
      setReady(true);
    })();
  }, [refresh, signOut]);

  return <AuthContext.Provider value={{ ready, me, signIn, signOut, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}

/** Sign-up details collected across screens (phone → profile → terms) before the account is created. */
export const signupDraft: {
  as: 'member' | 'coach';
  phone: string;
  signupToken: string;
  firstName: string;
  dateOfBirth: string;
  goals: string[];
} = { as: 'member', phone: '', signupToken: '', firstName: '', dateOfBirth: '', goals: [] };

/** Set once the instructor terms are accepted, so the application screen can send the acceptance. */
export const instructorTerms = { accepted: false };
