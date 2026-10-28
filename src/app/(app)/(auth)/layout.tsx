import Link from "next/link";
import { Wordmark } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-4 md:px-8 md:py-6">
        <Link href="/" className="inline-flex rounded-sm" aria-label="Open ATS">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 md:pt-[8vh]">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
