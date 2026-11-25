'use client';

import React, { useState } from 'react';
import { Expense } from '@/types';
import { groupExpensesByPayee, ExpenseGroup } from '@/lib/groupExpenses';
import { formatCurrency } from '@/lib/utils';
import { Building2, User, ChevronDown, ChevronRight, Layers, List } from 'lucide-react';

interface GroupedExpenseSectionProps {
  expenses: Expense[];
  renderItems: (items: Expense[], group?: ExpenseGroup) => React.ReactNode;
}

export const GroupedExpenseSections: React.FC<GroupedExpenseSectionProps> = ({
  expenses,
  renderItems
}) => {
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = groupExpensesByPayee(expenses);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4">
      {/* View Mode Bar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-neutral-500 font-medium">
          {viewMode === 'grouped'
            ? `${groups.length} ${groups.length === 1 ? 'section' : 'sections'} · ${expenses.length} total ${expenses.length === 1 ? 'bill' : 'bills'}`
            : `${expenses.length} total ${expenses.length === 1 ? 'bill' : 'bills'}`}
        </p>
        <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 border border-neutral-200">
          <button
            type="button"
            onClick={() => setViewMode('grouped')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'grouped'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Layers size={13} />
            Grouped
          </button>
          <button
            type="button"
            onClick={() => setViewMode('flat')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'flat'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <List size={13} />
            Flat List
          </button>
        </div>
      </div>

      {viewMode === 'flat' ? (
        <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
          {renderItems(expenses)}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((grp) => {
            const isCollapsed = !!collapsed[grp.key];
            return (
              <div
                key={grp.key}
                className="bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(grp.key)}
                  className="w-full px-5 py-3.5 bg-neutral-50/80 hover:bg-neutral-100/70 border-b border-neutral-200/80 flex flex-wrap items-center justify-between gap-3 text-left transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isCollapsed ? (
                      <ChevronRight size={17} className="text-neutral-400 shrink-0" />
                    ) : (
                      <ChevronDown size={17} className="text-neutral-400 shrink-0" />
                    )}
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        grp.kind === 'VENDOR'
                          ? 'bg-brand-50 text-brand-700 border border-brand-200/70'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                      }`}
                    >
                      {grp.kind === 'VENDOR' ? <Building2 size={16} /> : <User size={16} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-neutral-900 truncate">
                          {grp.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            grp.kind === 'VENDOR'
                              ? 'bg-brand-50 text-brand-700 border-brand-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {grp.kind === 'VENDOR' ? 'Vendor' : 'Student'}
                        </span>
                      </div>
                      {grp.subtitle && (
                        <p className="text-xs text-neutral-500 truncate">{grp.subtitle}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-auto">
                    <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 text-xs font-semibold border border-neutral-200">
                      {grp.items.length} {grp.items.length === 1 ? 'bill' : 'bills'}
                    </span>
                    <span className="text-sm font-bold text-neutral-900">
                      {formatCurrency(grp.totalAmount, grp.currency)}
                    </span>
                  </div>
                </button>

                {!isCollapsed && <div>{renderItems(grp.items, grp)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
