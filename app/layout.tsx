import type { ReactNode } from "react";
import "./globals.css";

/**
 * The root layout: the app-wide HTML shell and global stylesheet.
 *
 * The minimal Next App Router requires: every page (the greeting card) is
 * rendered inside this `<html>`/`<body>` scaffold.
 *
 * @example
 * // Next renders this automatically around every route; the home page's
 * // markup lands in `children`:
 * //   curl -s http://localhost:3456/ | head
 * //   # <html lang="en"><body>…<main id="message">Hello!</main>…</body></html>
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
