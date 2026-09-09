import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const publicApiOrigin = isDevelopment
  ? process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ?? ""
  : "";

const cloudinaryCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const buildVersion = (() => {
  try {
    return readFileSync(resolve(process.cwd(), ".build-version"), "utf8").trim();
  } catch {
    return "development";
  }
})();
const allowedDevOrigins = isDevelopment
  ? [
      ...new Set(
        [
          "sterile-neatly-earflap.ngrok-free.dev",
          ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",") ?? []),
        ]
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    ]
  : [];

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://maps.gstatic.com https://maps.googleapis.com",
  "font-src 'self' data:",
  `connect-src 'self'${isDevelopment ? ` ws: wss: http://localhost:8000 ${publicApiOrigin}` : ""}`,
  "frame-src https://www.google.com https://maps.google.com",
  "media-src 'self' https://res.cloudinary.com",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  isDevelopment ? "" : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  ...(!isDevelopment
    ? [
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin",
        },
        {
          key: "Cross-Origin-Resource-Policy",
          value: "same-origin",
        },
      ]
    : []),
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(!isDevelopment
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const applicationPageSources = [
  "/",
  "/booking",
  "/feedback",
  "/login",
  "/forgot-password",
  "/privacy-policy",
  "/terms-of-use",
  "/admin/:path*",
  "/manager/:path*",
];

const applicationPageCacheHeaders = [
  {
    key: "Cache-Control",
    value: "no-cache, max-age=0, must-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  generateBuildId: async () => buildVersion,
  env: {
    NEXT_PUBLIC_API_ORIGIN: publicApiOrigin,
    NEXT_PUBLIC_API_URL: "/api/v1",
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  allowedDevOrigins,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: cloudinaryCloudName ? `/${cloudinaryCloudName}/**` : "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/((?!_next/).*)",
        headers: securityHeaders,
      },
      {
        source: "/reset-password",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/verify-email",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      ...applicationPageSources.map((source) => ({
        source,
        headers: applicationPageCacheHeaders,
      })),
    ];
  },
};

export default nextConfig;
