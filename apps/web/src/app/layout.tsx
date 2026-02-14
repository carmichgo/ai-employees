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
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
