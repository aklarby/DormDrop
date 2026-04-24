import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Instrument_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const display = Instrument_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://dormdrop.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "DormDrop — student marketplace",
    template: "%s | DormDrop",
  },
  description:
    "Buy and sell dorm essentials with verified students at your school. Textbooks, furniture, electronics, and more.",
  keywords: [
    "college marketplace",
    "student marketplace",
    "dorm",
    "textbooks",
    "used furniture",
    "student resale",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "DormDrop",
    url: APP_URL,
    title: "DormDrop — student marketplace",
    description:
      "Buy and sell dorm essentials with verified students at your school.",
  },
  twitter: {
    card: "summary_large_image",
    title: "DormDrop — student marketplace",
    description:
      "Buy and sell dorm essentials with verified students at your school.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-body)] bg-[var(--color-surface)] text-[var(--color-primary)]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-[var(--color-primary)] focus:px-3 focus:py-1 focus:text-white"
        >
          Skip to content
        </a>
        <ToastProvider>
          <div id="main">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
