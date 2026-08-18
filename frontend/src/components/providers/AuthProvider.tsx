'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
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

  const fetchUserData = async (currentUser: User) => {
    try {
      // 1. Fetch user doc
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);

      let orgIds: string[] = [];
      let isGlobalAdmin = false;

      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data?.organisations) {
          orgIds = data.organisations;
        }
        if (data?.isSuperAdmin) {
          isGlobalAdmin = true;
          setIsSuperAdmin(true);
        } else {
          setIsSuperAdmin(false);
        }
      } else {
        setIsSuperAdmin(false);
      }

      // If no orgs in user profile, query all orgs where user is in members collection
      if (!isGlobalAdmin && orgIds.length === 0) {
        // Fallback query demo orgs or direct memberships
        const demoOrgs = ['org-acme-corp', 'org-globex-inc'];
        for (const demoOrgId of demoOrgs) {
          const mSnap = await getDoc(doc(db, 'organisations', demoOrgId, 'members', currentUser.uid));
          if (mSnap.exists()) {
            orgIds.push(demoOrgId);
          }
        }
      }

      const fetchedOrgs: Organisation[] = [];
      
      if (isGlobalAdmin) {
        // Super admin fetches ALL organisations
        const allOrgsSnap = await getDocs(collection(db, 'organisations'));
        allOrgsSnap.forEach(docSnap => {
          fetchedOrgs.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
      } else {
        for (const orgId of orgIds) {
          const orgSnap = await getDoc(doc(db, 'organisations', orgId));
          if (orgSnap.exists()) {
            fetchedOrgs.push({ id: orgSnap.id, ...(orgSnap.data() as any) });
          }
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

        const memberSnap = await getDoc(
          doc(db, 'organisations', selectedOrg.id, 'members', currentUser.uid)
        );
        if (memberSnap.exists()) {
          const memberData = memberSnap.data() as Member;
          setActiveMember(memberData);
          setActiveRole(memberData.role);
        } else if (isGlobalAdmin) {
          // Mock Super Admin role context locally
          setActiveMember({
            id: currentUser.uid,
            organisationId: selectedOrg.id,
            email: currentUser.email || '',
            displayName: currentUser.displayName || 'Super Admin',
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

    const memberSnap = await getDoc(doc(db, 'organisations', org.id, 'members', user.uid));
    if (memberSnap.exists()) {
      const memberData = memberSnap.data() as Member;
      setActiveMember(memberData);
      setActiveRole(memberData.role);
    } else if (isSuperAdmin) {
      setActiveMember({
        id: user.uid,
        organisationId: org.id,
        email: user.email || '',
        displayName: user.displayName || 'Super Admin',
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
    await fbSignOut(auth);
    setUser(null);
    setActiveOrg(null);
    setActiveRole(null);
    setActiveMember(null);
    setIsSuperAdmin(false);
    setUserOrgs([]);
    localStorage.removeItem('activeOrgId');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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
    });

    return () => unsubscribe();
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
