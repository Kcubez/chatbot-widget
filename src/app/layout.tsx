import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

// const geistSans = Geist({
//   variable: '--font-geist-sans',
//   subsets: ['latin'],
// });

// const geistMono = Geist_Mono({
//   variable: '--font-geist-mono',
//   subsets: ['latin'],
// });

const geistSans = { variable: 'font-sans' };
const geistMono = { variable: 'font-mono' };

export const metadata: Metadata = {
  title: 'OmniBot — AI Chatbot SaaS',
  description: 'Embed a custom-trained AI chatbot on your website in minutes. Powered by Gemini AI.',
};

import NextTopLoader from 'nextjs-toploader';
import { Toaster } from 'sonner';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextTopLoader
          color="#3b82f6"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #3b82f6,0 0 5px #3b82f6"
        />
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
