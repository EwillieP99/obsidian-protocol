import type { Metadata } from 'next';
import { Inter, Share_Tech_Mono, Chakra_Petch, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const shareTech = Share_Tech_Mono({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-share-tech',
  display: 'swap',
});

// Obsidian Protocol design system — Chakra Petch (display/UI) + IBM Plex Mono.
const chakra = Chakra_Petch({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-chakra',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEON NEXUS // Obsidian Protocol',
  description: 'Neural architecture builder for the Obsidian Vault network — Neon Nexus Megacorp, 2077.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${shareTech.variable} ${chakra.variable} ${plexMono.variable} font-sans bg-void text-cyan-glow antialiased`}>
        {children}
        <Toaster
          position="bottom-center"
          theme="dark"
          toastOptions={{
            style: {
              background: 'rgba(5, 6, 10, 0.92)',
              border: '1px solid rgba(0, 249, 255, 0.35)',
              color: '#7df9ff',
              backdropFilter: 'blur(8px)',
              fontFamily: 'var(--font-share-tech)',
              letterSpacing: '0.04em',
            },
          }}
        />
      </body>
    </html>
  );
}
