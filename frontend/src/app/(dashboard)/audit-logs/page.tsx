'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { AuditLog, AuditAction } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ScrollText, Filter, ShieldCheck, RefreshCw, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export default function AuditLogsPage() {
  const { activeOrg, activeRole } = useAuth();
  const orgId = activeOrg?.id;

  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-logs-list', orgId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: false });
        
      if (error || !data) return [];
      
      return data.map((d: any) => ({
        id: d.id,
        organisationId: d.organisation_id,
        actorId: d.actor_id,
        actorEmail: d.actor_email,
        action: d.action,
        entityType: d.entity_type,
        entityId: d.entity_id,
        before: d.before_data,
        after: d.after_data,
        timestamp: d.created_at
      })) as AuditLog[];
    },
    enabled: !!orgId && (activeRole === 'ADMIN' || activeRole === 'FINANCE')
  });

  const filteredLogs = logs.filter(
    (l) => selectedAction === 'ALL' || l.action === selectedAction
  );

  const distinctActions = Array.from(new Set(logs.map((l) => l.action)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Immutable Audit Log</h1>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Append-Only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-proof compliance ledger tracking all financial mutations, state transitions, and member changes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="ALL">All Actions ({logs.length})</option>
            {distinctActions.map((act) => (
              <option key={act} value={act}>
                {act.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={() => refetch()} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading audit trail...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <ScrollText className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-700">No Audit Records Found</h3>
              <p className="text-xs text-slate-500">Actions will be logged automatically by the backend system.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">Action</th>
                    <th className="px-6 py-3">Entity Type</th>
                    <th className="px-6 py-3">Entity ID</th>
                    <th className="px-6 py-3">Actor Email</th>
                    <th className="px-6 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5 text-slate-500 font-sans">{formatDateTime(log.timestamp)}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-900 font-sans">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-600 font-sans">{log.entityType}</td>
                      <td className="px-6 py-3.5 text-slate-700 truncate max-w-[140px]" title={log.entityId}>
                        {log.entityId.substring(0, 12)}...
                      </td>
                      <td className="px-6 py-3.5 text-slate-700 font-sans">{log.actorEmail}</td>
                      <td className="px-6 py-3.5 text-right font-sans">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedLog(log)}
                          leftIcon={<Eye className="w-3.5 h-3.5" />}
                        >
                          Diff
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diff Inspector Modal */}
      {selectedLog && (
        <Modal
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title={`Audit Event: ${selectedLog.action}`}
          description={`Request ID: ${selectedLog.requestId} • Timestamp: ${formatDateTime(selectedLog.timestamp)}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400 font-bold block mb-1">Before State</span>
                <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap">
                  {selectedLog.before ? JSON.stringify(selectedLog.before, null, 2) : '(None / Created)'}
                </pre>
              </div>
              <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-lg">
                <span className="text-emerald-700 font-bold block mb-1">After State</span>
                <pre className="text-[11px] font-mono text-emerald-900 whitespace-pre-wrap">
                  {selectedLog.after ? JSON.stringify(selectedLog.after, null, 2) : '(None / Deleted)'}
                </pre>
              </div>
            </div>

            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
              <div className="p-3 bg-slate-50 rounded-lg text-xs">
                <span className="text-slate-400 font-bold block mb-1">Metadata</span>
                <pre className="text-[11px] font-mono text-slate-700">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
