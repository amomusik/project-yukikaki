import Link from "next/link";
import { ShovelKid } from "@/components/mascot";

// Fallback for requests outside the [locale] segment (the root layout has no <html>).
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-snow p-6 text-center text-ink antialiased">
        <main className="max-w-md">
          <ShovelKid className="mx-auto h-40 w-48" />
          <h1 className="mt-6 text-2xl font-bold">This path hasn’t been shoveled yet.</h1>
          <p lang="ja" className="mt-2 text-muted">この道は、まだ雪かきされていません。</p>
          <Link href="/en" className="mt-6 inline-flex rounded-full bg-lantern px-5 py-2.5 font-semibold text-lantern-ink">
            Home / ホーム
          </Link>
        </main>
      </body>
    </html>
  );
}
