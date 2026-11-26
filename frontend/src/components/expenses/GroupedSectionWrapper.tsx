'use client';

import React, { useState, useEffect } from 'react';
import { Expense } from '@/types';
import { groupExpensesByPayee, ExpenseGroup } from '@/lib/groupExpenses';
import { formatCurrency } from '@/lib/utils';
import { Building2, User, Layers, List, ChevronRight } from 'lucide-react';

interface GroupedExpenseSectionProps {
  expenses: Expense[];
  renderItems: (items: Expense[], group?: ExpenseGroup) => React.ReactNode;
}

export const GroupedExpenseSections: React.FC<GroupedExpenseSectionProps> = ({
  expenses,
  renderItems
}) => {
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const groups = groupExpensesByPayee(expenses);
  const [selectedKey, setSelectedKey] = useState<string>(groups[0]?.key || '');

  // Keep selectedKey valid when filters/data change
  useEffect(() => {
    if (groups.length > 0 && !groups.some((g) => g.key === selectedKey)) {
      setSelectedKey(groups[0].key);
    }
  }, [groups, selectedKey]);

  const activeGroup = groups.find((g) => g.key === selectedKey) || groups[0] || null;

  return (
    <div className="space-y-4">
      {/* View Mode Bar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-neutral-500 font-medium">
          {viewMode === 'grouped'
            ? `${groups.length} ${groups.length === 1 ? 'payee' : 'payees'} · ${expenses.length} total ${expenses.length === 1 ? 'bill' : 'bills'}`
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
            By Payee
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Side: Names List (Vendors & Students) */}
          <div className="lg:col-span-4 xl:col-span-3 bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200/80 bg-neutral-50/80">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Vendors & Students ({groups.length})
              </p>
            </div>
            <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
              {groups.map((grp) => {
                const isSelected = activeGroup?.key === grp.key;
                return (
                  <button
                    key={grp.key}
                    type="button"
                    onClick={() => setSelectedKey(grp.key)}
                    className={`w-full px-4 py-3.5 text-left transition-colors flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-brand-50/70 border-l-4 border-l-brand-600'
                        : 'hover:bg-neutral-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          grp.kind === 'VENDOR'
                            ? 'bg-brand-50 text-brand-700 border border-brand-200/70'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                        }`}
                      >
                        {grp.kind === 'VENDOR' ? <Building2 size={15} /> : <User size={15} />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${isSelected ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-800'}`}>
                          {grp.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                              grp.kind === 'VENDOR'
                                ? 'bg-brand-50 text-brand-700 border-brand-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {grp.kind === 'VENDOR' ? 'Vendor' : 'Student'}
                          </span>
                          <span className="text-[11px] text-neutral-500 font-medium">
                            · {grp.items.length} {grp.items.length === 1 ? 'bill' : 'bills'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-neutral-900">
                        {formatCurrency(grp.totalAmount, grp.currency)}
                      </span>
                      <ChevronRight
                        size={15}
                        className={isSelected ? 'text-brand-600' : 'text-neutral-300'}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Side: Expanded Bills & Details for Selected Vendor / Student */}
          <div className="lg:col-span-8 xl:col-span-9 bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
            {activeGroup && (
              <>
                <div className="px-6 py-4 bg-neutral-50/80 border-b border-neutral-200/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        activeGroup.kind === 'VENDOR'
                          ? 'bg-brand-50 text-brand-700 border border-brand-200/70'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                      }`}
                    >
                      {activeGroup.kind === 'VENDOR' ? <Building2 size={18} /> : <User size={18} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-neutral-900 truncate">
                          {activeGroup.name}
                        </h3>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            activeGroup.kind === 'VENDOR'
                              ? 'bg-brand-50 text-brand-700 border-brand-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {activeGroup.kind === 'VENDOR' ? 'Vendor' : 'Student'}
                        </span>
                      </div>
                      {activeGroup.subtitle && (
                        <p className="text-xs text-neutral-500 mt-0.5">{activeGroup.subtitle}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="px-3 py-1 rounded-full bg-white text-neutral-700 text-xs font-semibold border border-neutral-200 shadow-sm">
                      {activeGroup.items.length} {activeGroup.items.length === 1 ? 'bill' : 'bills'}
                    </span>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                        Total Amount
                      </p>
                      <p className="text-base font-bold text-neutral-900">
                        {formatCurrency(activeGroup.totalAmount, activeGroup.currency)}
                      </p>
                    </div>
                  </div>
                </div>

                <div>{renderItems(activeGroup.items, activeGroup)}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
