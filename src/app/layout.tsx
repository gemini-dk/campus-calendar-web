import type { Metadata } from "next";

import { getSiteOrigin } from "@/lib/site-url";
import {
  PWA_APP_DESCRIPTION,
  PWA_APP_NAME,
  PWA_ICON_PATH,
  PWA_THEME_COLOR,
} from "@/lib/pwa";

import { AppProviders } from "./providers";

const siteOrigin = getSiteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: PWA_APP_NAME,
    template: `%s | ${PWA_APP_NAME}`,
  },
  applicationName: PWA_APP_NAME,
  description: PWA_APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: PWA_ICON_PATH,
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: [
      {
        url: PWA_ICON_PATH,
        type: "image/png",
        sizes: "512x512",
      },
    ],
  },
  appleWebApp: {
    title: PWA_APP_NAME,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full">
      <head>
        <meta name="theme-color" content={PWA_THEME_COLOR} />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          integrity="sha512-p1VrHjs9wMlOQjo1w8X1LgyoMr55mRtLK7Z/HVbT4ulqtoT8YfseWLa16qJBWO5V9FfHz8v/L+Qp9Yj9d80Spg=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className="flex h-full min-h-dvh w-full flex-col overflow-hidden bg-slate-50 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
