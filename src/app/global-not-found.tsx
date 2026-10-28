import type { Metadata } from "next";
import Link from "next/link";
import { instrumentSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Page introuvable",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="fr" className={instrumentSans.variable}>
      <body className="flex min-h-dvh items-center bg-stone px-4">
        <main className="mx-auto w-full max-w-md">
          <p className="text-13 text-ink-muted">Erreur 404</p>
          <h1 className="mt-1 text-24 font-semibold">Cette page n&apos;existe pas</h1>
          <p className="mt-2 text-14 text-ink-muted">
            L&apos;adresse est peut-être incomplète, ou la page a été retirée.
          </p>
          <p lang="en" className="mt-1 text-14 text-ink-muted">
            This page does not exist.
          </p>
          <Link href="/" className="mt-6 inline-flex h-8 items-center rounded-sm bg-cobalt px-3 text-14 font-medium text-paper hover:bg-cobalt-hover">
            Revenir à l&apos;accueil
          </Link>
        </main>
      </body>
    </html>
  );
}
