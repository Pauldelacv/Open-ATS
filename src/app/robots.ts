import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/careers/", disallow: ["/api/", "/jobs", "/candidates", "/settings", "/inbox", "/login", "/setup", "/invite/", "/design"] }],
    sitemap: appUrl("/sitemap.xml"),
  };
}
