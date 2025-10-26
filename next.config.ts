import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
