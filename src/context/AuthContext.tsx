import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { apiClient, configureAmplify, type CognitoUser } from '@/lib/aws-api-client';
import type { Profile } from '@/lib/types';

interface AuthContextValue {
  user: CognitoUser | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null; role?: string }>;
  signUp: (
    email: string,
    password: string,
    role: 'patient' | 'clinician',
    firstName: string,
    lastName: string
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  confirmSignUp: (email: string, code: string) => Promise<{ error: string | null; role?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (cognitoUser: CognitoUser) => {
    try {
      const data = await apiClient.getPatientProfile();
      const roleFromAttr =
        cognitoUser.role ||
        (cognitoUser['cognito:groups']?.[0] === 'Patients' ? 'patient' : 'clinician');
      const next: Profile = {
        id: cognitoUser.sub,
        email: cognitoUser.email,
        role: (data as any)?.role || roleFromAttr,
        first_name: cognitoUser.given_name || (data as any)?.first_name || '',
        last_name: cognitoUser.family_name || (data as any)?.last_name || '',
        date_of_birth: null,
        gender: '',
        phone: '',
        address: '',
        health_preferences: {},
        constraints: [],
        genetic_markers: {},
        clinician_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(data as object),
      };
      setProfile(next);
      return next;
    } catch (error) {
      console.error('Failed to load profile', error);
      // Still set a minimal profile from Cognito so routing works
      const minimal: Profile = {
        id: cognitoUser.sub,
        email: cognitoUser.email,
        role: (cognitoUser.role as any) || 'patient',
        first_name: cognitoUser.given_name || '',
        last_name: cognitoUser.family_name || '',
        date_of_birth: null,
        gender: '',
        phone: '',
        address: '',
        health_preferences: {},
        constraints: [],
        genetic_markers: {},
        clinician_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setProfile(minimal);
      return minimal;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await configureAmplify();
      const currentUser = await apiClient.getCurrentUserAsync();
      if (cancelled) return;
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await apiClient.login(email, password);
      if (!result.error) {
        const currentUser = await apiClient.getCurrentUserAsync();
        setUser(currentUser);
        if (currentUser) {
          const p = await fetchProfile(currentUser);
          return { error: null, role: p?.role || currentUser.role };
        }
      }
      return { error: result.error, role: undefined };
    },
    [fetchProfile]
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      role: 'patient' | 'clinician',
      firstName: string,
      lastName: string
    ) => {
      return apiClient.register(email, password, role, firstName, lastName);
    },
    []
  );

  const confirmSignUpFn = useCallback(
    async (email: string, code: string) => {
      const result = await apiClient.confirmRegistration(email, code);
      if (!result.error) {
        const currentUser = await apiClient.getCurrentUserAsync();
        setUser(currentUser);
        if (currentUser) {
          const p = await fetchProfile(currentUser);
          return { error: null, role: p?.role || currentUser.role };
        }
      }
      return { error: result.error, role: undefined };
    },
    [fetchProfile]
  );

  const signOut = useCallback(async () => {
    await apiClient.logout();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user);
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        signUp,
        confirmSignUp: confirmSignUpFn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
