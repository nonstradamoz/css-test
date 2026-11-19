import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'ClearSpend · Expense & Refund Management',
  description: 'Modern corporate expense tracking, policy verification, and refund management system.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 selection:bg-primary-500 selection:text-white">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
