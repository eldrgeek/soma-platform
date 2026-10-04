import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { createSomaKnownDevice } from '../somaKnownDevice.js';

type KnownDevice = ReturnType<typeof createSomaKnownDevice>;

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export interface AuthProviderProps {
  supabase: SupabaseClient;
  children: ReactNode;
  /** Optional known-device helpers (defaults to `soma.known.device` in localStorage). */
  knownDevice?: KnownDevice;
  onAuthEvent?: (event: AuthChangeEvent, session: Session | null) => void;
}

export function AuthProvider({
  supabase,
  children,
  knownDevice,
  onAuthEvent,
}: AuthProviderProps) {
  const device = useMemo(() => knownDevice ?? createSomaKnownDevice(), [knownDevice]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) device.mark();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next?.user) device.mark();
      onAuthEvent?.(event, next);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, device, onAuthEvent]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, supabase],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
