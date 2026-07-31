import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerPromotionAccess } from "@/lib/promotions/customer-access";
import PushNotificationManager from "@/components/PushNotificationManager";
import PromotionGallery from "@/components/PromotionGallery";
import PromotionAnalyticsTracker from "@/components/PromotionAnalyticsTracker";

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const encodedToken = encodeURIComponent(token);

  return {
    title: "Ofertas PMG",
    description: "Portal de ofertas PMG Atacadista",
    manifest: `/ofertas/${encodedToken}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "PMG Ofertas",
    },
    icons: {
      apple: "/logo-pmg.png",
      icon: "/logo-pmg.png",
    },
  };
}

function tableFromDistance(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const distance = Number(value);
  if (!Number.isFinite(distance) || distance < 0) return null;

  if (distance < 100) return 0;
  if (distance < 200) return 1;
  if (distance < 300) return 2;
  if (distance < 400) return 3;
  if (distance < 500) return 4;
  return 5;
}

export default async function CustomerOffersPage({
  params,
}: PageProps) {
  const { token } = await params;
  const access = await getCustomerPromotionAccess(token);

  if (!access) notFound();

  const customer = access.customer;
  const table =
    tableFromDistance(customer.distance_km) ??
    customer.price_table ??
    access.price_table;

  const now = new Date();

  const promotions =
    table === null || table === undefined
      ? []
      : await prisma.webPromotion.findMany({
          where: {
            company_id: access.company_id,
            status: "published",
            targets: {
              some: { price_table: Number(table) },
            },
            AND: [
              {
                OR: [
                  { valid_from: null },
                  { valid_from: { lte: now } },
                ],
              },
              {
                OR: [
                  { valid_until: null },
                  { valid_until: { gte: now } },
                ],
              },
            ],
          },
          include: {
            images: {
              orderBy: { sort_order: "asc" },
            },
            deliveries: {
              where: {
                customer_id: customer.id,
              },
              select: {
                id: true,
              },
              take: 1,
            },
          },
          orderBy: [
            { published_at: "desc" },
            { created_at: "desc" },
          ],
          take: 30,
        });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <section className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-xl">
        <span className="text-xs font-black tracking-widest text-green-700">
          PMG ATACADISTA
        </span>

        <h1 className="mt-2 text-3xl font-black">
          Olá, {customer.trade_name || customer.legal_name}
        </h1>

        <p className="mt-2 text-slate-500">
          Ofertas da Tabela {table ?? "não definida"}.
        </p>

        <div className="mt-8 grid gap-5">
          {promotions.length === 0 ? (
            <div className="rounded-2xl border bg-slate-50 p-10 text-center">
              <h2 className="text-xl font-bold">
                Promoções em breve
              </h2>
              <p className="mt-2 text-slate-500">
                Não há promoção ativa para sua tabela neste momento.
              </p>
            </div>
          ) : (
            promotions.map((promotion) => {
              const deliveryId = promotion.deliveries[0]?.id || "";

              return (
                <article
                  key={promotion.id}
                  data-promotion-id={promotion.id}
                  data-delivery-id={deliveryId}
                  className="overflow-hidden rounded-2xl border bg-white shadow-sm"
                >
                  <PromotionGallery
                    title={promotion.title}
                    images={promotion.images}
                  />

                  <div className="p-5">
                    <h2 className="text-2xl font-black">
                      {promotion.title}
                    </h2>

                    <p className="mt-3 whitespace-pre-wrap text-slate-600">
                      {promotion.portal_text || promotion.description}
                    </p>

                    {promotion.contact_whatsapp && (
                      <a
                        className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-green-700 px-4 font-black text-white"
                        href={`https://wa.me/${promotion.contact_whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        data-whatsapp-promotion={promotion.id}
                        data-whatsapp-delivery={deliveryId}
                      >
                        {promotion.call_to_action ||
                          "Entrar em contato"}
                      </a>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <PromotionAnalyticsTracker portalToken={token} />
      <PushNotificationManager portalToken={token} />
    </main>
  );
}
