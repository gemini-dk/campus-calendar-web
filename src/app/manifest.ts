import type { MetadataRoute } from "next";

import {
  PWA_APP_NAME,
  PWA_ICON_SMALL_PATH,
  PWA_ICON_PATH,
  PWA_MANIFEST_DESCRIPTION,
  PWA_THEME_COLOR,
} from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PWA_APP_NAME,
    short_name: PWA_APP_NAME,
    description: PWA_MANIFEST_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: PWA_THEME_COLOR,
    theme_color: PWA_THEME_COLOR,
    scope: "/",
    id: "/",
    icons: [
      {
        src: PWA_ICON_SMALL_PATH,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: PWA_ICON_PATH,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: PWA_ICON_PATH,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
