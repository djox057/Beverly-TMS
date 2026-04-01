import React, { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  office: string | null;
  individual_mode?: boolean;
}

export type UserRole = 'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Fetch user profile and roles when signed in
        if (session?.user) {
          setTimeout(() => {
            fetchUserProfile(session.user.id);
            fetchUserRoles(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
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
        fetchUserRoles(session.user.id);
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

  const fetchUserRoles = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) throw error;
      setRoles(data?.map(r => r.role as UserRole) || []);
    } catch (error) {
      console.error('Error fetching user roles:', error);
      setRoles([]);
    }
  };

  const signUp = async (email: string, password: string, fullName?: string, role?: UserRole) => {
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
        description: "Account created successfully! You can now sign in.",
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
      // Check if there's an active session before attempting to sign out
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (currentSession) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      
      // Clear local state regardless
      setSession(null);
      setUser(null);
      setProfile(null);
      setRoles([]);

      toast({
        title: "Success",
        description: "Signed out successfully!",
      });

      return { error: null };
    } catch (error: any) {
      // Clear local state even on error
      setSession(null);
      setUser(null);
      setProfile(null);
      setRoles([]);
      
      toast({
        title: "Success",
        description: "Signed out successfully!",
      });

      return { error: null };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-password-reset', {
        body: {
          email,
          redirectTo: `https://fleetcarrier.us/reset-password`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Success",
        description: "Password reset email sent! Check your inbox.",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email",
        variant: "destructive",
      });

      return { error };
    }
  };

  const hasRole = (requiredRole: UserRole): boolean => {
    if (roles.length === 0) return false;
    
    // Admin and Accounting have access to everything except driver-only pages
    if ((roles.includes('admin') || roles.includes('accounting')) && requiredRole !== 'driver') return true;
    
    // Manager has same access as admin (except user management which is checked separately)
    if (roles.includes('manager') && requiredRole !== 'driver') return true;
    
    // Supervisor has same access as admin (except user management which is checked separately)
    if (roles.includes('supervisor') && requiredRole !== 'driver') return true;
    
    // Chicago Management has view-only access to everything except driver-only pages
    if (roles.includes('chicago_management') && requiredRole !== 'driver') return true;
    
    // Safety has access to dispatch functions (can create/edit orders, manage trucks/drivers)
    if (roles.includes('safety') && requiredRole === 'dispatch') return true;
    
    // Maintenance has access to dispatch functions (can change driver/truck/trailer assignments)
    if (roles.includes('maintenance') && requiredRole === 'dispatch') return true;
    
    // Check exact role match
    return roles.includes(requiredRole);
  };

  // Helper to get primary role for display
  const getPrimaryRole = (): UserRole | null => {
    if (roles.length === 0) return null;
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('accounting')) return 'accounting';
    if (roles.includes('manager')) return 'manager';
    if (roles.includes('supervisor')) return 'supervisor';
    if (roles.includes('chicago_management')) return 'chicago_management';
    if (roles.includes('safety')) return 'safety';
    if (roles.includes('maintenance')) return 'maintenance';
    if (roles.includes('dispatch')) return 'dispatch';
    if (roles.includes('afterhours')) return 'afterhours';
    if (roles.includes('yard')) return 'yard';
    if (roles.includes('driver')) return 'driver';
    return roles[0];
  };

  return {
    user,
    session,
    profile,
    roles,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    hasRole,
    getPrimaryRole,
  };
};