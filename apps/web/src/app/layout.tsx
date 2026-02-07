import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Employees — Hire Your AI Workforce",
  description:
    "Hire AI employees that work 24/7. Each employee gets their own computer, email, Slack, and more. Powered by OpenClaw.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
