import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  const { token } = await params;
  const encodedToken = encodeURIComponent(token);
  const portalPath = `/ofertas/${encodedToken}`;

  return NextResponse.json(
    {
      id: portalPath,
      name: "PMG Ofertas",
      short_name: "PMG",
      description: "Portal de ofertas PMG Atacadista",
      start_url: portalPath,
      scope: "/ofertas/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#ffffff",
      orientation: "portrait",
      icons: [
        {
          src: "/icons/pmg-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/logo-pmg.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
