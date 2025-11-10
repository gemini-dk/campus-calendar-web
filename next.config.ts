import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERCEL_ENV:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
  },
  async redirects() {
    return [
      {
        source: "/calendars/:webId",
        destination: "/:webId/calendar/",
        permanent: true,
      },
      {
        source: "/calendars/:webId/",
        destination: "/:webId/calendar/",
        permanent: true,
      },
      {
        source: "/calendars",
        destination: "/",
        permanent: true,
      },
      {
        source: "/calendars/",
        destination: "/",
        permanent: true,
      },
    ];
  },
  async rewrites(){
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/:path*`,
      },
    ];
  }
};

export default nextConfig;
