import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import {
  Search,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { Card, CardHeader, PageHeader, SearchInput, Select } from '../components/ui';

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
      <PageHeader
        title="System Audit Trail"
        subtitle="Immutable business mutation logging • Entity state snapshots • User action attribution"
        actions={
          <>
            <SearchInput
              icon={<Search className="w-4 h-4" />}
              type="text"
              placeholder="Search audit trail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="font-mono"
            >
              <option value="ALL">All Actions ({allActions.length})</option>
              {allActions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {/* Audit Log Table */}
      <Card className="overflow-hidden shadow-2xs">
        <CardHeader>
          <span className="text-xs font-mono text-muted-foreground">{filteredLogs.length} Immutable Log Entries</span>
          <span className="text-xs font-mono text-muted-foreground">Security Guarantee: Passwords and tokens never recorded</span>
        </CardHeader>

        <div className="divide-y divide-border text-xs font-mono">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground font-sans text-xs">
              No audit logs found matching criteria.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const hasPayload = log.new_data || log.old_data || log.metadata;

              return (
                <div key={log.id} className="hover:bg-muted/60 transition-colors">
                  <div
                    onClick={() => hasPayload && toggleExpand(log.id)}
                    className={`p-3.5 flex items-center justify-between gap-4 ${
                      hasPayload ? 'cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {hasPayload && (
                        <span className="text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </span>
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground text-xs">{log.action}</span>
                          <Badge variant="neutral">{log.entity_type}</Badge>
                          <span className="text-muted-foreground text-[11px]">ID: #{log.entity_id}</span>
                        </div>
                        <div className="text-muted-foreground text-[11px] font-sans mt-0.5">
                          Initiated by <span className="font-semibold text-foreground">{log.user_name}</span> (ID: {log.user_id})
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-muted-foreground text-[11px]">
                      <div>{new Date(log.created_at).toLocaleDateString()}</div>
                      <div>{new Date(log.created_at).toLocaleTimeString()}</div>
                    </div>
                  </div>

                  {/* Expanded JSON payload */}
                  {isExpanded && hasPayload && (
                    <div className="px-10 pb-4 pt-1 bg-muted/90 border-t border-border text-[11px]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {log.new_data && (
                          <div>
                            <div className="font-bold text-foreground mb-1">State Mutation Data:</div>
                            <pre className="p-2.5 bg-primary text-primary-foreground rounded-md overflow-x-auto text-[10px]">
                              {JSON.stringify(log.new_data, null, 2)}
                            </pre>
                          </div>
                        )}

                        {log.old_data && (
                          <div>
                            <div className="font-bold text-foreground mb-1">Prior State:</div>
                            <pre className="p-2.5 bg-muted text-foreground border border-border rounded overflow-x-auto text-[10px]">
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
      </Card>
    </div>
  );
};
