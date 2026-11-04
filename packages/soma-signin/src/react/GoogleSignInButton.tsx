import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNoncePair, loadGoogleIdentity } from '../googleIdentity.js';

// Google's own "Sign in with Google" button (Google Identity Services). Google
// draws the button, which is its official standard, and its account picker
// shows the app's site, not the Supabase project address. On success the ID
// token goes to Supabase via signInWithIdToken. If Google's script can't load,
// it renders `fallback` (the redirect-flow button) instead.

export interface GoogleSignInButtonProps {
  supabase: SupabaseClient;
  clientId: string;
  disabled?: boolean;
  fallback: ReactNode;
  onSignedIn: () => void;
  onError: (error: { message: string }) => void;
}

export function GoogleSignInButton({
  supabase,
  clientId,
  disabled,
  fallback,
  onSignedIn,
  onError,
}: GoogleSignInButtonProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let live = true;
    (async () => {
      const gsi = await loadGoogleIdentity();
      if (!live) return;
      if (!gsi || !holder.current) {
        setState('failed');
        return;
      }
      const nonce = await createNoncePair();
      gsi.initialize({
        client_id: clientId,
        nonce: nonce.hashed,
        use_fedcm_for_prompt: true,
        callback: async (response: { credential?: string }) => {
          if (!response?.credential) {
            onError({ message: 'Google did not return a sign-in token. Please try again.' });
            return;
          }
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
            nonce: nonce.raw,
          });
          if (error) onError(error);
          else onSignedIn();
        },
      });
      const width = Math.min(400, Math.max(200, Math.round(holder.current.getBoundingClientRect().width || 320)));
      gsi.renderButton(holder.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width,
      });
      setState('ready');
    })().catch(() => live && setState('failed'));
    return () => {
      live = false;
    };
  }, [clientId]);

  if (state === 'failed') return <>{fallback}</>;
  return (
    <div
      ref={holder}
      className="soma-signin-google-gsi"
      data-provider="google"
      aria-busy={state === 'loading'}
      style={{ minHeight: 44, pointerEvents: disabled ? 'none' : undefined, opacity: disabled ? 0.5 : 1 }}
    />
  );
}
