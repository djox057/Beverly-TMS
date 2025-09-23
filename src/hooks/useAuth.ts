import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: 'dispatch' | 'admin' | 'manager';
  avatar_url: string | null;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Fetch user profile when signed in
        if (session?.user) {
          setTimeout(() => {
            fetchUserProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const signUp = async (email: string, password: string, fullName?: string, role?: 'dispatch' | 'admin' | 'manager') => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName || email,
            role: role || 'dispatch'
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Account created successfully! Please check your email to confirm your account.",
      });

      return { error: null };
    } catch (error: any) {
      const errorMessage = error.message === 'User already registered' 
        ? 'An account with this email already exists. Please try signing in instead.'
        : error.message || 'Failed to create account';

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });

      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Signed in successfully!",
      });

      return { error: null };
    } catch (error: any) {
      const errorMessage = error.message === 'Invalid login credentials'
        ? 'Invalid email or password. Please try again.'
        : error.message || 'Failed to sign in';

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });

      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;

      toast({
        title: "Success",
        description: "Signed out successfully!",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to sign out',
        variant: "destructive",
      });

      return { error };
    }
  };

  const hasRole = (requiredRole: 'dispatch' | 'admin' | 'manager'): boolean => {
    if (!profile) return false;
    
    // Admin has access to everything
    if (profile.role === 'admin') return true;
    
    // Manager has access to dispatch functions
    if (profile.role === 'manager' && requiredRole === 'dispatch') return true;
    
    // Check exact role match
    return profile.role === requiredRole;
  };

  return {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    hasRole,
  };
};