import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ToastProvider } from '@heroui/react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Providers } from '@/_app/providers';
import '@/_app/globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Video Meetings',
    template: '%s · Video Meetings',
  },
  description: 'Schedule and join video meetings with your team.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <ThemeToggle />
          <ToastProvider />
        </Providers>
      </body>
    </html>
  );
}
