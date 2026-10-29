import { cn } from "@/lib/cn";

/** Open ATS mark: a sheet with a folded corner and one highlighted line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("size-5", className)}>
      <path
        d="M4.75 2.75h7.5l3 3v11.5h-10.5z"
        fill="#fff"
        stroke="#18233A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12.25 2.75v3h3"
        fill="none"
        stroke="#18233A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="6.5" y="9" width="7" height="2.5" fill="#FFE45C" />
      <path d="M7 13.75h5" stroke="#18233A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-14 font-semibold text-ink", className)}
    >
      <LogoMark />
      Open ATS
    </span>
  );
}
