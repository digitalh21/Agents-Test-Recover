import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Growth Systems — Enterprise Telecalling CRM & HR Dashboard",
  description:
    "Auto Growth Systems: enterprise telecalling CRM with RBAC, 1M-lead pipeline, approvals center, KYC, automated earnings and HR management.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
