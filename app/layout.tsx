import "./globals.css";

// The real <html> lives in app/[locale]/layout.tsx so the lang attribute follows the locale.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
