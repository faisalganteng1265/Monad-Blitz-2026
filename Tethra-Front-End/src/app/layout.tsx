// src/app/layout.tsx
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { Providers } from './providers';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { minikitConfig } from '@/minikit.config';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});


const { miniapp } = minikitConfig;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: miniapp.ogTitle,
    description: miniapp.ogDescription,
    openGraph: {
      title: miniapp.ogTitle,
      description: miniapp.ogDescription,
      url: miniapp.homeUrl,
      siteName: miniapp.name,
      images: [
        {
          url: miniapp.ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${miniapp.name} Banner`,
        },
      ],
      locale: 'en_US',
      type: 'website',
    },
    other: {
      'base:app_id': '6971cfcf3a92926b661fcfea',
      'fc:miniapp': JSON.stringify({
        version: 'next',
        imageUrl: miniapp.heroImageUrl,
        button: {
          title: `Launch ${miniapp.name}`,
          action: {
            type: 'launch_miniapp',
            name: miniapp.name,
            url: miniapp.homeUrl,
            splashImageUrl: miniapp.splashImageUrl,
            splashBackgroundColor: miniapp.splashBackgroundColor,
          },
        },
      }),
      'fc:frame': JSON.stringify({
        version: miniapp.version,
        imageUrl: miniapp.heroImageUrl,
        button: {
          title: `Launch ${miniapp.name}`,
          action: {
            name: `Launch ${miniapp.name}`,
            type: "launch_frame",
          },
        },
      })
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 0.5,
  maximumScale: 3,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <link rel="icon" href="/tethra-logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/tethra-logo.png" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <SidebarProvider>{children}</SidebarProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
