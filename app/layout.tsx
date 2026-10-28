import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Lexend } from "next/font/google";
import "./globals.css";

// Lexend was designed to cut reading effort; it carries every sentence. Bricolage Grotesque is the
// chunky cut-paper display face for headings and key numbers. Both self-hosted by next/font.
const lexend = Lexend({ variable: "--font-body", subsets: ["latin", "latin-ext"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Hulog",
  description: "PayPal installment payments and Maceda Law rights for property buyers in the Philippines",
};

export const viewport: Viewport = {
  themeColor: "#2b1338",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The variable must be on <html>: the theme's --font-sans is resolved at the root, and a variable
    // set on <body> leaves it unresolved there, so every page fell back to the system font.
    <html lang="en" className={`${lexend.variable} ${bricolage.variable}`}>
      <body className="flex min-h-dvh flex-col">
        {children}
        {/* The brand signature: the same straw band that sits under every header closes every page. */}
        <div className="weave-band mt-auto" aria-hidden />
      </body>
    </html>
  );
}
