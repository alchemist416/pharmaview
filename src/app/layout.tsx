import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/layout/TopNav";

export const metadata: Metadata = {
  title: "PharmaView — Pharma Supply Chain Intelligence",
  description: "Bloomberg Terminal-style intelligence dashboard for pharmaceutical supply chain monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-terminal-bg text-primary antialiased min-h-screen">
        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  );
}
