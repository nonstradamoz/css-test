'use client';

import React from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Building2, LogOut, ChevronDown, UserCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export const Navbar: React.FC = () => {
  const { user, activeOrg, activeRole, userOrgs, switchOrg, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 py-3.5 flex items-center justify-between shadow-2xs">
      {/* Left: Organization Switcher */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              CRS <span className="text-xs font-normal text-slate-400">| Expense & Refund</span>
            </span>
          </div>
        </div>

        {userOrgs.length > 0 && (
          <div className="relative group pl-4 border-l border-slate-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/70 px-3 py-1.5 rounded-lg cursor-pointer transition-colors border border-slate-200/60">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>{activeOrg?.name || 'Select Organisation'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </div>

            {/* Dropdown */}
            <div className="absolute left-4 mt-1 w-56 rounded-xl bg-white shadow-elevated border border-slate-200/80 py-1.5 hidden group-hover:block z-50 animate-in fade-in-50 duration-150">
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Switch Organisation
              </div>
              {userOrgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => switchOrg(org.id)}
                  className={`w-full text-left px-3.5 py-2 text-xs font-medium flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    activeOrg?.id === org.id ? 'text-primary-600 font-semibold bg-primary-50/50' : 'text-slate-700'
                  }`}
                >
                  <span>{org.name}</span>
                  {activeOrg?.id === org.id && <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: User & Role Info */}
      <div className="flex items-center gap-4">
        {activeRole && <Badge role={activeRole} />}

        {user && (
          <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs">
                {user.email ? user.email.substring(0, 2).toUpperCase() : 'U'}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-slate-900 leading-none">{user.displayName || user.email?.split('@')[0]}</p>
                <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{user.email}</p>
              </div>
            </div>

            <button
              onClick={() => signOut()}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
