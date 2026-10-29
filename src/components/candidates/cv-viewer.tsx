"use client";

import { Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

export type CvFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type PdfState = { status: "loading" } | { status: "ready"; pages: number } | { status: "error" };

/** Renders PDF pages with pdf.js on paper sheets, or a DOCX converted to HTML. */
export function CvViewer({ files, className }: { files: CvFile[]; className?: string }) {
  const t = useTranslations("panel.cv");
  const [selectedId, setSelectedId] = useState(files[0]?.id ?? null);
  const file = files.find((f) => f.id === selectedId) ?? files[0];

  if (!file) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center bg-stone px-6 py-16 text-center",
          className,
        )}
      >
        <p className="text-14 font-medium">{t("none")}</p>
        <p className="mt-1 text-13 text-ink-muted">{t("noneBody")}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col bg-stone", className)}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        {files.length > 1 ? (
          <select
            aria-label={t("versions")}
            value={file.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-7 max-w-56 truncate rounded-sm border border-line-strong bg-paper px-2 text-13"
          >
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.fileName}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate text-13 text-ink-muted">{file.fileName}</span>
        )}
        <span className="flex-1" />
        <a
          href={`/api/files/${file.id}`}
          target="_blank"
          rel="noopener"
          aria-label={t("open")}
          title={t("open")}
          className="inline-flex size-7 items-center justify-center rounded-sm text-ink-muted hover:bg-stone-strong hover:text-ink"
        >
          <ExternalLink className="size-4" />
        </a>
        <a
          href={`/api/files/${file.id}?download=1`}
          aria-label={t("download")}
          title={t("download")}
          className="inline-flex size-7 items-center justify-center rounded-sm text-ink-muted hover:bg-stone-strong hover:text-ink"
        >
          <Download className="size-4" />
        </a>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        {file.mimeType === "application/pdf" ? (
          <PdfPages key={file.id} fileId={file.id} />
        ) : (
          <DocxPreview key={file.id} fileId={file.id} />
        )}
      </div>
    </div>
  );
}

function PdfPages({ fileId }: { fileId: string }) {
  const t = useTranslations("panel.cv");
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PdfState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url: `/api/files/${fileId}`, withCredentials: true });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        if (cancelled) return;
        const host = container.current;
        if (!host) return;
        host.replaceChildren();
        // Rendered once at a comfortable resolution, then scaled by CSS to the pane width.
        const width = Math.max(560, host.clientWidth);
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const viewport = page.getViewport({ scale: scale * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.maxWidth = `${Math.floor(base.width * Math.max(scale, 1.4))}px`;
          canvas.style.height = "auto";
          canvas.className = "block rounded-md border border-line bg-paper";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", t("page", { page: n, total: doc.numPages }));
          host.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (n === 1) setState({ status: "ready", pages: doc.numPages });
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[cv] preview failed", error);
          setState({ status: "error" });
        }
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [fileId, t]);

  return (
    <>
      {state.status === "loading" ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-line bg-paper p-8"
          aria-hidden="true"
        >
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="mt-6 h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-6 h-3 w-full" />
          <Skeleton className="h-3 w-10/12" />
        </div>
      ) : null}
      {state.status === "error" ? (
        <p className="rounded-md border border-line bg-paper p-6 text-14 text-ink-muted">
          {t("error")}
        </p>
      ) : null}
      <div ref={container} className="flex flex-col items-center gap-3" />
    </>
  );
}

function DocxPreview({ fileId }: { fileId: string }) {
  const t = useTranslations("panel.cv");
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/${fileId}/preview`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { html: string }) => !cancelled && setHtml(data.html))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [fileId]);
  if (error)
    return (
      <p className="rounded-md border border-line bg-paper p-6 text-14 text-ink-muted">
        {t("error")}
      </p>
    );
  if (html === null) {
    return (
      <div
        className="flex flex-col gap-3 rounded-md border border-line bg-paper p-8"
        aria-hidden="true"
      >
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
      </div>
    );
  }
  return (
    <div
      className="rich-text rich-text-compact rounded-md border border-line bg-paper p-6 md:p-8"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
