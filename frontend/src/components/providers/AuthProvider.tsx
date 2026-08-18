'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import { Member, Organisation, Role } from '@/types';

interface AuthContextType {
  user: User | null;
  activeOrg: Organisation | null;
  activeRole: Role | null;
  activeMember: Member | null;
  isSuperAdmin: boolean;
  userOrgs: Organisation[];
  loading: boolean;
  switchOrg: (orgId: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  activeOrg: null,
  activeRole: null,
  activeMember: null,
  isSuperAdmin: false,
  userOrgs: [],
  loading: true,
  switchOrg: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeOrg, setActiveOrg] = useState<Organisation | null>(null);
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [activeMember, setActiveMember] = useState<Member | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userOrgs, setUserOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchUserData = async (currentUser: User) => {
    try {
      // 1. Fetch user doc
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (userError) {
        console.error('Error fetching user:', userError);
      }

      const isGlobalAdmin = userData?.is_super_admin || false;
      setIsSuperAdmin(isGlobalAdmin);

      // 2. Fetch organisations
      let fetchedOrgs: Organisation[] = [];
      
      if (isGlobalAdmin) {
        const { data: allOrgs } = await supabase.from('organisations').select('*');
        if (allOrgs) {
          fetchedOrgs = allOrgs as Organisation[];
        }
      } else {
        const { data: memberOrgs } = await supabase
          .from('members')
          .select('organisations(*)')
          .eq('user_id', currentUser.id);
          
        if (memberOrgs) {
          fetchedOrgs = memberOrgs.map(m => m.organisations).filter(Boolean) as any as Organisation[];
        }
      }

      setUserOrgs(fetchedOrgs);

      // Select active org from local storage or default to first
      const storedOrgId = localStorage.getItem('activeOrgId');
      const selectedOrg =
        fetchedOrgs.find((o) => o.id === storedOrgId) || fetchedOrgs[0] || null;

      if (selectedOrg) {
        setActiveOrg(selectedOrg);
        localStorage.setItem('activeOrgId', selectedOrg.id);

        const { data: memberData } = await supabase
          .from('members')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('organisation_id', selectedOrg.id)
          .maybeSingle();

        if (memberData) {
          const mappedMember: Member = {
            id: memberData.user_id,
            organisationId: memberData.organisation_id,
            role: memberData.role,
            email: currentUser.email || '',
            displayName: userData?.display_name || '',
            joinedAt: new Date(memberData.created_at) as any
          };
          setActiveMember(mappedMember);
          setActiveRole(isGlobalAdmin ? 'ADMIN' : memberData.role);
        } else if (isGlobalAdmin) {
          setActiveMember({
            id: currentUser.id,
            organisationId: selectedOrg.id,
            email: currentUser.email || '',
            displayName: userData?.display_name || 'Super Admin',
            role: 'ADMIN',
            joinedAt: new Date() as any
          });
          setActiveRole('ADMIN');
        } else {
          setActiveMember(null);
          setActiveRole(null);
        }
      } else {
        setActiveOrg(null);
        setActiveRole(null);
        setActiveMember(null);
      }
    } catch (err) {
      console.error('Error fetching user auth profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const switchOrg = async (orgId: string) => {
    if (!user) return;
    const org = userOrgs.find((o) => o.id === orgId);
    if (!org) return;

    setActiveOrg(org);
    localStorage.setItem('activeOrgId', org.id);

    const { data: memberData } = await supabase
      .from('members')
      .select('*')
      .eq('user_id', user.id)
      .eq('organisation_id', org.id)
      .maybeSingle();

    if (memberData) {
      const mappedMember: Member = {
        id: memberData.user_id,
        organisationId: memberData.organisation_id,
        role: memberData.role,
        email: user.email || '',
        displayName: user.user_metadata?.full_name || '',
        joinedAt: new Date(memberData.created_at) as any
      };
      setActiveMember(mappedMember);
      setActiveRole(isSuperAdmin ? 'ADMIN' : memberData.role);
    } else if (isSuperAdmin) {
      setActiveMember({
        id: user.id,
        organisationId: org.id,
        email: user.email || '',
        displayName: user.user_metadata?.full_name || 'Super Admin',
        role: 'ADMIN',
        joinedAt: new Date() as any
      });
      setActiveRole('ADMIN');
    } else {
      setActiveMember(null);
      setActiveRole(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setActiveOrg(null);
    setActiveRole(null);
    setActiveMember(null);
    setIsSuperAdmin(false);
    setUserOrgs([]);
    localStorage.removeItem('activeOrgId');
  };

  useEffect(() => {
    // Initial fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        fetchUserData(currentUser);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user || null;
        setUser(currentUser);
        if (currentUser) {
          await fetchUserData(currentUser);
        } else {
          setUser(null);
          setActiveOrg(null);
          setActiveRole(null);
          setActiveMember(null);
          setIsSuperAdmin(false);
          setUserOrgs([]);
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrg,
        activeRole,
        activeMember,
        isSuperAdmin,
        userOrgs,
        loading,
        switchOrg,
        signOut,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
