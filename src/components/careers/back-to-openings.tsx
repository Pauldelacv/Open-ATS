"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export function BackToOpenings({ label }: { label: string }) {
  const params = useParams<{ org: string }>();
  return (
    <Link
      href={`/careers/${params.org}`}
      className="mt-6 inline-flex h-10 items-center rounded-sm border border-line-strong px-4 text-16 font-medium hover:bg-stone"
    >
      {label}
    </Link>
  );
}
