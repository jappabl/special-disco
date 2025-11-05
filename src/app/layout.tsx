import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sleepdefeater - Attention Tracker",
  description: "Webcam-based attention and drowsiness detection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
