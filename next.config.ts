import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Two root layouts (back office and career site) need a routing-level 404 page.
    globalNotFound: true,
  },
  // Packages that read files or use native-ish APIs at runtime stay external to the server bundle.
  // sanitize-html stays bundled: it require()s the ESM-only htmlparser2, which fails where
  // the runtime cannot require ES modules (Vercel functions).
  serverExternalPackages: ["unpdf", "mammoth", "pdf-lib", "nodemailer"],
  // Migration files are read at runtime by the migrator.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
