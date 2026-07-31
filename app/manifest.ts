import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PMG Portal",
    short_name: "PMG",
    description: "Portal do Cliente PMG",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/pmg-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/pmg-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/logo-pmg.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}