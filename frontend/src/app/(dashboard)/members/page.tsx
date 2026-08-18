'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { api } from '@/lib/api';
import { Member, Role } from '@/types';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Users, UserPlus, Shield, Trash2, Mail } from 'lucide-react';

const ROLES: Role[] = ['ADMIN', 'FINANCE', 'REVIEWER', 'MEMBER'];

export default function MembersPage() {
  const { activeOrg, activeRole, user } = useAuth();
  const orgId = activeOrg?.id;

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: members = [], isLoading, refetch } = useQuery({
    queryKey: ['members-list', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('members')
        .select(`
          user_id,
          role,
          created_at,
          users (
            id,
            email,
            display_name
          )
        `)
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: false });
        
      if (error || !data) return [];
      
      return data.map((d: any) => ({
        id: d.user_id,
        organisationId: orgId,
        role: d.role,
        email: d.users?.email || '',
        displayName: d.users?.display_name || '',
        joinedAt: d.created_at
      })) as Member[];
    },
    enabled: !!orgId
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !inviteEmail) return;
    setIsInviting(true);
    setError(null);

    try {
      await api.inviteMember({
        organisationId: orgId,
        email: inviteEmail.trim(),
        role: inviteRole
      });
      setIsInviteOpen(false);
      setInviteEmail('');
      refetch();
    } catch (err: any) {
      setError(err.message || 'Invitation failed.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleChangeRole = async (targetMemberId: string, newRole: Role) => {
    if (!orgId) return;
    try {
      await api.changeMemberRole({
        organisationId: orgId,
        targetMemberId,
        newRole
      });
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to update role.');
    }
  };

  const handleRemoveMember = async (targetMemberId: string) => {
    if (!orgId) return;
    if (!confirm('Are you sure you want to remove this member from the organization?')) return;

    try {
      await api.removeMember({
        organisationId: orgId,
        targetMemberId
      });
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member.');
    }
  };

  const isAdmin = activeRole === 'ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organisation Members</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage employee access, role-based permissions (RBAC), and invitations for {activeOrg?.name}.
          </p>
        </div>

        {isAdmin && (
          <Button size="sm" onClick={() => setIsInviteOpen(true)} leftIcon={<UserPlus className="w-4 h-4" />}>
            Invite Member
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading roster...</div>
          ) : members.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">No members found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Member</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Joined Date</th>
                    {isAdmin && <th className="px-6 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                          {m.displayName ? m.displayName.substring(0, 2).toUpperCase() : 'U'}
                        </div>
                        <span>{m.displayName || m.email.split('@')[0]}</span>
                        {m.id === user?.id && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">You</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500">{m.email}</td>
                      <td className="px-6 py-4">
                        {isAdmin && m.id !== user?.id ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleChangeRole(m.id, e.target.value as Role)}
                            className="px-2 py-1 text-xs rounded border border-slate-300 bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-primary-500/20"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge role={m.role} />
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400">{formatDate(m.joinedAt)}</td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right">
                          {m.id !== user?.uid && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveMember(m.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite New Member"
        description={`Send an invitation to join ${activeOrg?.name || 'Organisation'}.`}
      >
        <form onSubmit={handleInvite} className="space-y-4">
          {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          <Input
            label="Employee Corporate Email *"
            type="email"
            required
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Assign Role *
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="MEMBER">MEMBER (Can create and submit expenses)</option>
              <option value="REVIEWER">REVIEWER (Can review, approve, request changes, reject)</option>
              <option value="FINANCE">FINANCE (Can manage reimbursements and retries)</option>
              <option value="ADMIN">ADMIN (Full management and audit access)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsInviteOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={isInviting} leftIcon={<Mail className="w-4 h-4" />}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
