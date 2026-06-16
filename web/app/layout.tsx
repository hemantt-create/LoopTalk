import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoopTalk - Random Voice Chat",
  description:
    "Anonymous one-to-one random voice chat built for quick conversations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
