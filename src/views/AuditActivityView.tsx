import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import {
  History,
  Search,
  Filter,
  User,
  Clock,
  Layers,
  ShieldAlert,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Badge } from '../components/common/Badge';

export const AuditActivityView: React.FC = () => {
  const { auditLogs } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const allActions = Array.from(new Set(auditLogs.map((l) => l.action)));

  const filteredLogs = auditLogs.filter((log) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      log.action.toLowerCase().includes(q) ||
      log.user_name.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      log.entity_id.toLowerCase().includes(q);

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">System Audit Trail</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Immutable business mutation logging • Entity state snapshots • User action attribution
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-neutral-900 focus:outline-none w-64 bg-white"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="p-1.5 text-xs border border-neutral-300 rounded bg-white text-neutral-800 font-mono"
          >
            <option value="ALL">All Actions ({allActions.length})</option>
            {allActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="p-3 border-b border-neutral-200 bg-neutral-50/70 text-xs font-mono text-neutral-500 flex justify-between">
          <span>{filteredLogs.length} Immutable Log Entries</span>
          <span>Security Guarantee: Passwords and tokens never recorded</span>
        </div>

        <div className="divide-y divide-neutral-200 text-xs font-mono">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 font-sans text-xs">
              No audit logs found matching criteria.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const hasPayload = log.new_data || log.old_data || log.metadata;

              return (
                <div key={log.id} className="hover:bg-neutral-50/60 transition-colors">
                  <div
                    onClick={() => hasPayload && toggleExpand(log.id)}
                    className={`p-3.5 flex items-center justify-between gap-4 ${
                      hasPayload ? 'cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {hasPayload && (
                        <span className="text-neutral-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-neutral-700" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </span>
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-900 text-xs">{log.action}</span>
                          <Badge variant="neutral">{log.entity_type}</Badge>
                          <span className="text-neutral-400 text-[11px]">ID: #{log.entity_id}</span>
                        </div>
                        <div className="text-neutral-500 text-[11px] font-sans mt-0.5">
                          Initiated by <span className="font-semibold text-neutral-700">{log.user_name}</span> (ID: {log.user_id})
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-neutral-400 text-[11px]">
                      <div>{new Date(log.created_at).toLocaleDateString()}</div>
                      <div>{new Date(log.created_at).toLocaleTimeString()}</div>
                    </div>
                  </div>

                  {/* Expanded JSON payload */}
                  {isExpanded && hasPayload && (
                    <div className="px-10 pb-4 pt-1 bg-neutral-50/90 border-t border-neutral-100 text-[11px]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {log.new_data && (
                          <div>
                            <div className="font-bold text-neutral-700 mb-1">State Mutation Data:</div>
                            <pre className="p-2.5 bg-neutral-900 text-neutral-100 rounded overflow-x-auto text-[10px]">
                              {JSON.stringify(log.new_data, null, 2)}
                            </pre>
                          </div>
                        )}

                        {log.old_data && (
                          <div>
                            <div className="font-bold text-neutral-700 mb-1">Prior State:</div>
                            <pre className="p-2.5 bg-neutral-100 text-neutral-800 border border-neutral-200 rounded overflow-x-auto text-[10px]">
                              {JSON.stringify(log.old_data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
