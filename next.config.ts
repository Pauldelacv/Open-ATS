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
  serverExternalPackages: ["unpdf", "mammoth", "pdf-lib", "nodemailer", "sanitize-html"],
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
