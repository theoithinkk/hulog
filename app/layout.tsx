import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";

// Designed for low-vision readers; one family, self-hosted by next/font, keeps pages light abroad.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
  // next/font has no metric overrides for this face yet; fall back plainly instead of warning.
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

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
    <html lang="en" className={atkinson.variable}>
      <body>{children}</body>
    </html>
  );
}
