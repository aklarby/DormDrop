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

export const metadata: Metadata = {
  title: "DormDrop",
  description: "Buy and sell dorm essentials with students at your school",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-body)] bg-[var(--color-surface)] text-[var(--color-primary)]">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
