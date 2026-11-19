'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AuditLog } from '@/types';
import { formatDate } from '@/lib/utils';
import { ScrollText, Eye } from 'lucide-react';

export default function AuditLogsPage() {
  const { role } = useAuth();
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api.auditLogs.list({ limit: 100 }),
    enabled: ['ADMIN', 'FINANCE'].includes(role || '')
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">System Audit Logs</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Immutable audit records of all financial events, state transitions, and administrative operations.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">Loading audit trail...</div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-sm text-neutral-500">
            No audit records captured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50/75 border-b border-neutral-200 text-xs text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Action</th>
                  <th className="px-6 py-3.5">Entity Type</th>
                  <th className="px-6 py-3.5">Actor ID</th>
                  <th className="px-6 py-3.5">IP Address</th>
                  <th className="px-6 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-6 py-4 text-xs text-neutral-500 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-800 font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-neutral-700">
                      {log.entity_type}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-neutral-500">
                      {log.actor_id ? `${log.actor_id.substring(0, 8)}...` : 'System'}
                    </td>
                    <td className="px-6 py-4 text-xs text-neutral-500">
                      {log.ip_address || '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1"
                      >
                        <Eye size={13} /> View JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-neutral-900">
              Audit Event: {selectedLog.action}
            </h3>
            <div className="bg-neutral-900 rounded-xl p-4 text-emerald-400 font-mono text-xs overflow-auto max-h-96">
              <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
