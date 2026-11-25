'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { NotificationItem } from '@/types';
import { useRouter } from 'next/navigation';
import {
  Menu,
  Bell,
  CheckCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Inbox
} from 'lucide-react';

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  ADMIN:    { label: 'Admin',    color: '#4c82c3', bg: '#edf4fc' },
  FINANCE:  { label: 'Finance',  color: '#b87e04', bg: '#fff9e6' },
  REVIEWER: { label: 'Reviewer', color: '#3b6fae', bg: '#edf4fc' },
  EMPLOYEE: { label: 'Employee', color: '#666c7a', bg: '#f6f5f0' }
};

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getNotifIcon(type: string) {
  switch (type) {
    case 'REVIEW_REQUIRED':
      return <Clock size={16} className="text-brand-600 shrink-0" />;
    case 'ADMIN_APPROVAL_REQUIRED':
      return <ShieldCheck size={16} className="text-amber-600 shrink-0" />;
    case 'REVIEW_PASSED':
    case 'CLAIM_APPROVED':
      return <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />;
    case 'CHANGES_REQUESTED':
      return <AlertTriangle size={16} className="text-amber-600 shrink-0" />;
    case 'CLAIM_REJECTED':
      return <XCircle size={16} className="text-red-600 shrink-0" />;
    default:
      return <Bell size={16} className="text-neutral-500 shrink-0" />;
  }
}

interface NavbarProps {
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleMobileMenu }) => {
  const { user, role } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const badge = role ? ROLE_BADGE[role] : null;
  const name = user?.full_name || user?.email?.split('@')[0] || '';

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Poll notifications every 8 seconds
  const { data: notifData } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => api.notifications.list(25),
    enabled: !!user,
    refetchInterval: 8000
  });

  const unreadCount = notifData?.unread_count ?? 0;
  const notifications = notifData?.items ?? [];

  const handleNotificationClick = async (notif: NotificationItem) => {
    setIsNotifOpen(false);
    if (!notif.is_read) {
      try {
        await api.notifications.markAsRead(notif.id);
        queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
      } catch {
        // Non-blocking
      }
    }
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllAsRead();
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    } catch {
      // Non-blocking
    }
  };

  return (
    <header className="px-4 md:px-7 py-3 flex items-center justify-between sticky top-0 z-30 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 transition-colors min-h-[56px]">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Hamburger Drawer Trigger */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation menu"
          className="md:hidden p-2 -ml-1 text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 shrink-0"
        >
          <Menu size={22} />
        </button>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-800 leading-tight truncate">
            {greet()}{name ? `, ${name}` : ''}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5 hidden sm:block">
            ClearSpend · {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-2">
        {/* Notification Bell & Popover */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsNotifOpen((prev) => !prev)}
              aria-label="Notifications"
              className="relative p-2 rounded-xl text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold leading-none shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-neutral-200/80 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-red-100 text-red-700 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                    >
                      <CheckCheck size={13} />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-neutral-100">
                  {notifications.length === 0 ? (
                    <div className="py-10 px-4 text-center">
                      <Inbox size={28} className="mx-auto text-neutral-300 mb-2" />
                      <p className="text-xs font-semibold text-neutral-600">No notifications yet</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        You will be notified here about review updates and approvals.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <button
                        key={notif.id}
                        type="button"
                        onClick={() => handleNotificationClick(notif)}
                        className={`w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors flex items-start gap-3 ${
                          !notif.is_read ? 'bg-brand-50/40' : ''
                        }`}
                      >
                        <div className="mt-0.5">{getNotifIcon(notif.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs leading-snug ${!notif.is_read ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-700'}`}>
                              {notif.title}
                            </p>
                            {!notif.is_read && (
                              <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2 leading-relaxed">
                            {notif.message}
                          </p>
                          <p className="text-[10px] text-neutral-400 mt-1 font-medium">
                            {formatRelativeTime(notif.created_at)}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {badge && (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
            style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}30` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: badge.color }} />
            {badge.label}
          </div>
        )}
      </div>
    </header>
  );
};
