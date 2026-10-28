"use client";

import { useEffect, useState } from "react";

/** Mobile bar with the apply action, hidden once the form is on screen. */
export function StickyApply({ label, targetId }: { label: string; targetId: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry?.isIntersecting && (entry?.boundingClientRect.top ?? 0) > 0), {
      rootMargin: "0px 0px -20% 0px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <a
        href={`#${targetId}`}
        className="flex h-11 w-full items-center justify-center rounded-sm bg-brand text-16 font-medium text-brand-fg hover:bg-brand-hover"
      >
        {label}
      </a>
    </div>
  );
}
