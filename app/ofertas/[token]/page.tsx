import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerPromotionAccess } from "@/lib/promotions/customer-access";
import PushNotificationManager from "@/components/PushNotificationManager";
import PromotionGallery from "@/components/PromotionGallery";
import PromotionAnalyticsTracker from "@/components/PromotionAnalyticsTracker";
import CustomerPortalChat from "@/components/CustomerPortalChat";

type PageProps = {
  params: Promise<{ token: string }>;
};

type PortalDelivery = {
  order_id: string;
  status: string;
  delivery_start: Date | string;
  delivery_end: Date | string;
  alert_count: number | null;
  order_number: string | null;
};

function formatHour(value: Date | string | null | undefined) {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatDay(value: Date | string | null | undefined) {
  if (!value) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const encodedToken = encodeURIComponent(token);

  return {
    title: "Portal PMG",
    description: "Ofertas, entregas e atendimento PMG Atacadista",
    manifest: `/ofertas/${encodedToken}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "PMG",
    },
    icons: {
      apple: "/logo-pmg.png",
      icon: "/logo-pmg.png",
    },
  };
}

export default async function CustomerOffersPage({
  params,
}: PageProps) {
  const { token } = await params;
  const access = await getCustomerPromotionAccess(token);

  if (!access) notFound();

  const customer = access.customer;
  const now = new Date();
  const encodedToken = encodeURIComponent(token);

  /*
   * A entrega é a autorização definitiva para visualizar a promoção.
   * Assim, o portal funciona igualmente para:
   * - seleção automática por tabela;
   * - campanha personalizada por clientes.
   *
   * Também impede que um cliente veja uma promoção apenas por compartilhar
   * a mesma tabela comercial com outro destinatário.
   */
  const promotions = await prisma.webPromotion.findMany({
    where: {
      company_id: access.company_id,
      status: "published",
      deliveries: {
        some: {
          company_id: access.company_id,
          customer_id: customer.id,
        },
      },
      AND: [
        {
          OR: [{ valid_from: null }, { valid_from: { lte: now } }],
        },
        {
          OR: [{ valid_until: null }, { valid_until: { gte: now } }],
        },
      ],
    },
    include: {
      images: {
        orderBy: { sort_order: "asc" },
      },
      deliveries: {
        where: {
          company_id: access.company_id,
          customer_id: customer.id,
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
    orderBy: [{ published_at: "desc" }, { created_at: "desc" }],
    take: 30,
  });

  /*
   * Fallback importante para iPhone/PWA:
   * se o sistema operacional abrir a raiz do portal ao tocar no Push,
   * a entrega pendente aparece logo no início da tela e leva para a
   * confirmação correta do pedido.
   */
  let deliveries: PortalDelivery[] = [];

  try {
    deliveries = await prisma.$queryRawUnsafe<PortalDelivery[]>(
      `SELECT
         odt.order_id,
         odt.status,
         odt.delivery_start,
         odt.delivery_end,
         odt.alert_count,
         so.order_number
       FROM order_delivery_tracking odt
       JOIN "SalesOrder" so ON so.id = odt.order_id
       WHERE odt.company_id = $1::uuid
         AND odt.customer_id = $2::uuid
         AND odt.status IN ('PENDING', 'READY', 'NOT_READY')
         AND odt.delivery_end >= now() - interval '6 hours'
         AND odt.delivery_start <= now() + interval '48 hours'
       ORDER BY
         CASE odt.status
           WHEN 'PENDING' THEN 0
           WHEN 'NOT_READY' THEN 1
           ELSE 2
         END,
         odt.delivery_start ASC
       LIMIT 10`,
      access.company_id,
      customer.id
    );
  } catch (error) {
    // O portal de ofertas deve continuar funcionando mesmo se
    // o módulo de entregas estiver temporariamente indisponível.
    console.error("[PORTAL_DELIVERIES]", error);
  }

  const pendingDeliveries = deliveries.filter(
    (delivery) => delivery.status === "PENDING"
  );

  const firstPending = pendingDeliveries[0] || null;

  const deliveryNavigationHref =
    pendingDeliveries.length === 1
      ? `/ofertas/${encodedToken}/entrega/${encodeURIComponent(
          pendingDeliveries[0].order_id
        )}`
      : "#entregas";

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-32 pt-28 sm:py-8">
      <section className="mx-auto max-w-3xl rounded-3xl bg-white p-5 shadow-xl sm:p-6">
        <span className="text-xs font-black tracking-widest text-green-700">
          PMG ATACADISTA
        </span>

        <h1 className="mt-2 text-3xl font-black text-slate-950">
          Olá, {customer.trade_name || customer.legal_name}
        </h1>

        <p className="mt-2 text-slate-500">
          Seu portal PMG para ofertas, entregas e atendimento.
        </p>

        {/* Navegação simples com aparência de aplicativo */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <a
            href="#ofertas"
            className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm transition active:scale-[0.98]"
          >
            <div className="text-3xl">🎁</div>
            <strong className="mt-2 block text-base font-black text-violet-900">
              Ofertas
            </strong>
            <span className="mt-1 block text-xs font-bold text-violet-600">
              {promotions.length > 0
                ? `${promotions.length} disponível${
                    promotions.length === 1 ? "" : "is"
                  }`
                : "Veja promoções"}
            </span>
          </a>

          <a
            href={deliveryNavigationHref}
            className={`rounded-2xl border p-4 shadow-sm transition active:scale-[0.98] ${
              pendingDeliveries.length > 0
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="text-3xl">🚚</div>
            <strong
              className={`mt-2 block text-base font-black ${
                pendingDeliveries.length > 0
                  ? "text-emerald-900"
                  : "text-slate-800"
              }`}
            >
              Entregas
            </strong>
            <span
              className={`mt-1 block text-xs font-bold ${
                pendingDeliveries.length > 0
                  ? "text-emerald-700"
                  : "text-slate-500"
              }`}
            >
              {pendingDeliveries.length > 0
                ? `${pendingDeliveries.length} aguardando confirmação`
                : "Acompanhe seus pedidos"}
            </span>
          </a>
        </div>

        {/* CTA prioritário: aparece no topo se houver entrega aguardando */}
        {firstPending && (
          <a
            href={`/ofertas/${encodedToken}/entrega/${encodeURIComponent(
              firstPending.order_id
            )}`}
            className="mt-5 block rounded-3xl border-2 border-emerald-300 bg-emerald-600 p-5 text-white shadow-lg transition active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-2xl">
                🚨
              </div>

              <div className="min-w-0">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-emerald-100">
                  Ação necessária
                </span>
                <h2 className="mt-1 text-xl font-black">
                  Confirme sua entrega agora
                </h2>
                <p className="mt-2 text-sm font-bold leading-5 text-emerald-50">
                  Pedido {firstPending.order_number || "PMG"} ·{" "}
                  {formatHour(firstPending.delivery_start)} às{" "}
                  {formatHour(firstPending.delivery_end)}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-emerald-800">
              ABRIR CONFIRMAÇÃO DA ENTREGA →
            </div>
          </a>
        )}

        <section id="ofertas" className="scroll-mt-28 pt-8">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                🎁 Ofertas
              </span>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Ofertas para você
              </h2>
            </div>

            <a
              href="#entregas"
              className="text-xs font-black text-emerald-700"
            >
              Ver entregas ↓
            </a>
          </div>

          <div className="grid gap-5">
            {promotions.length === 0 ? (
              <div className="rounded-2xl border bg-slate-50 p-8 text-center">
                <h3 className="text-xl font-bold">Promoções em breve</h3>
                <p className="mt-2 text-slate-500">
                  Não há promoção ativa direcionada para você neste momento.
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
                      <h3 className="text-2xl font-black">{promotion.title}</h3>

                      <p className="mt-3 whitespace-pre-wrap text-slate-600">
                        {promotion.portal_text || promotion.description}
                      </p>

                      {promotion.contact_whatsapp && (
                        <a
                          className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-green-700 px-4 font-black text-white"
                          href={`https://wa.me/${promotion.contact_whatsapp.replace(
                            /\D/g,
                            ""
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          data-whatsapp-promotion={promotion.id}
                          data-whatsapp-delivery={deliveryId}
                        >
                          {promotion.call_to_action || "Entrar em contato"}
                        </a>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section id="entregas" className="scroll-mt-28 pt-10">
          <div className="mb-4">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
              🚚 Entregas
            </span>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              Suas entregas
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Toque em um pedido para abrir a confirmação.
            </p>
          </div>

          {deliveries.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-3xl">📦</div>
              <strong className="mt-2 block text-base font-black text-slate-800">
                Nenhuma entrega para confirmar agora
              </strong>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Quando houver uma entrega programada, ela aparecerá aqui.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {deliveries.map((delivery) => {
                const isPending = delivery.status === "PENDING";
                const isReady = delivery.status === "READY";

                return (
                  <a
                    key={delivery.order_id}
                    href={`/ofertas/${encodedToken}/entrega/${encodeURIComponent(
                      delivery.order_id
                    )}`}
                    className={`flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-sm transition active:scale-[0.99] ${
                      isPending
                        ? "border-emerald-300 bg-emerald-50"
                        : isReady
                          ? "border-emerald-100 bg-white"
                          : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {isPending ? "🚨" : isReady ? "✅" : "⚠️"}
                        </span>
                        <strong className="truncate text-sm font-black text-slate-900">
                          Pedido {delivery.order_number || "PMG"}
                        </strong>
                      </div>

                      <p className="mt-2 text-xs font-bold text-slate-600">
                        {formatDay(delivery.delivery_start)} ·{" "}
                        {formatHour(delivery.delivery_start)} às{" "}
                        {formatHour(delivery.delivery_end)}
                      </p>

                      <p
                        className={`mt-1 text-xs font-black ${
                          isPending
                            ? "text-emerald-700"
                            : isReady
                              ? "text-emerald-600"
                              : "text-amber-700"
                        }`}
                      >
                        {isPending
                          ? "AGUARDANDO SUA CONFIRMAÇÃO"
                          : isReady
                            ? "VOCÊ CONFIRMOU QUE ESTÁ PRONTO"
                            : "VENDEDOR AVISADO"}
                      </p>
                    </div>

                    <div className="shrink-0 text-xl font-black text-slate-400">
                      ›
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <CustomerPortalChat portalToken={token} />
      <PromotionAnalyticsTracker portalToken={token} />
      <PushNotificationManager portalToken={token} />
    </main>
  );
}
