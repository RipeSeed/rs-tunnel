import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'rs-tunnel admin',
  description: 'Owner-only admin panel for a self-hosted rs-tunnel instance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
