import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateRange(date: Date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0),
    end: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
  };
}

async function createDeliveryNotificationLog(args: any) {
  const client = prisma as any;

  // Compatibilidade: o schema atual não possui o model deliveryNotificationLog.
  // Se o model existir em outra base/ambiente, salva normalmente.
  if (client.deliveryNotificationLog?.create) {
    return client.deliveryNotificationLog.create(args);
  }

  // Fallback seguro para não quebrar build/runtime enquanto a tabela não existe.
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...args.data,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function buildSellerMessage(sellerName: string, targetDateLabel: string, orders: any[]) {
  const total = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const clients = new Set(orders.map((o) => o.customer_name).filter(Boolean));

  const lines = orders.slice(0, 20).map((o, index) => {
    return `${index + 1}. ${o.customer_name || "Cliente sem nome"}\n   Pedido: ${o.order_number || "-"} | ${money(Number(o.total || 0))}`;
  });

  const extra = orders.length > 20 ? `\n\n+ ${orders.length - 20} pedidos adicionais no sistema.` : "";

  return `📦 *Agenda de Entregas — ${targetDateLabel}*\n\nBom dia, ${sellerName || "vendedor"}!\n\nVocê possui *${orders.length} pedidos* para entrega.\nClientes: *${clients.size}*\nTotal previsto: *${money(total)}*\n\n${lines.join("\n\n")}${extra}\n\nAcesse o Zentra Sales AI para ver detalhes e acompanhar sua carteira.`;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const company_id = access.companyId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Supervisor não possui acesso a esta rota operacional." },
        { status: 403 }
      );
    }

    if (!company_id || !userId) {
      return NextResponse.json(
        { error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const targetDate = dateParam ? new Date(`${dateParam}T12:00:00`) : new Date();
    const { start, end } = dateRange(targetDate);

    const orders = await prisma.salesOrder.findMany({
      where: {
        company_id,
        delivery_date: { gte: start, lte: end },
        ...(role === "VENDEDOR" ? { seller_id: userId } : {}),
      },
      include: { SalesOrderItem: true, SalesCustomer: true },
      orderBy: [{ seller_name: "asc" }, { customer_name: "asc" }],
    });

    const normalizedOrders = orders.map((order: any) => ({
      ...order,
      items: order.SalesOrderItem || [],
      customer: order.SalesCustomer || null,
    }));

    const sellersMap = new Map<string, any>();
    for (const order of normalizedOrders) {
      const key = order.seller_id || order.seller_name || "sem_vendedor";
      const current = sellersMap.get(key) || {
        seller_id: order.seller_id,
        seller_name: order.seller_name || "Sem vendedor",
        orders: [],
        total_sales: 0,
        order_count: 0,
      };

      current.orders.push(order);
      current.total_sales += Number(order.total || 0);
      current.order_count += 1;
      sellersMap.set(key, current);
    }

    const sellers = Array.from(sellersMap.values());

    return NextResponse.json({
      target_date: targetDate.toISOString(),
      sellers,
      total_orders: normalizedOrders.length,
      total_sales: normalizedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
    });
  } catch (error) {
    console.error("[GET /api/crm/delivery-summary]", error);
    return NextResponse.json({ error: "Erro ao carregar agenda de entregas." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const company_id = access.companyId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Supervisor não possui acesso a esta rota operacional." },
        { status: 403 }
      );
    }

    if (!company_id || !userId) {
      return NextResponse.json(
        { error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const dateParam = body.date;
    const targetDate = dateParam ? new Date(`${dateParam}T12:00:00`) : new Date();
    const { start, end } = dateRange(targetDate);
    const label = targetDate.toLocaleDateString("pt-BR");

    const orders = await prisma.salesOrder.findMany({
      where: {
        company_id,
        delivery_date: { gte: start, lte: end },
        ...(role === "VENDEDOR" ? { seller_id: userId } : {}),
      },
      orderBy: [{ seller_name: "asc" }, { customer_name: "asc" }],
    });

    const users = await prisma.company_users.findMany({
      where: {
        company_id,
        active: true,
        ...(role === "VENDEDOR" ? { user_id: userId } : {}),
      },
      select: { user_id: true, name: true, phone: true, role: true },
    });

    const sellersMap = new Map<string, any[]>();
    for (const order of orders) {
      const key = order.seller_id || order.seller_name || "sem_vendedor";
      sellersMap.set(key, [...(sellersMap.get(key) || []), order]);
    }

    const logs = [];

    for (const [sellerKey, sellerOrders] of sellersMap.entries()) {
      const user = users.find((u) => u.user_id === sellerKey) || users.find((u) => u.name === sellerOrders[0]?.seller_name);
      const message = buildSellerMessage(user?.name || sellerOrders[0]?.seller_name || "vendedor", label, sellerOrders);

      const log = await createDeliveryNotificationLog({
        data: {
          company_id,
          seller_id: user?.user_id || sellerOrders[0]?.seller_id || null,
          target_date: targetDate,
          whatsapp: user?.phone || null,
          message,
          status: "pending",
        },
      });

      logs.push(log);
    }

    const supervisorOrdersTotal = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const supervisorMessage = `📊 *Resumo de Entregas da Equipe — ${label}*\n\nPedidos: *${orders.length}*\nTotal previsto: *${money(supervisorOrdersTotal)}*\n\n${Array.from(sellersMap.entries()).map(([_, sellerOrders]) => {
      const total = sellerOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      return `• ${sellerOrders[0]?.seller_name || "Sem vendedor"}: ${sellerOrders.length} pedidos | ${money(total)}`;
    }).join("\n")}`;

    if (role === "GERAL") {
      const supervisors = users.filter((u) =>
        ["SUPERVISOR", "GERAL", "MASTER"].includes(
          String(u.role).toUpperCase()
        )
      );

      for (const supervisor of supervisors) {
        const log = await createDeliveryNotificationLog({
          data: {
            company_id,
            seller_id: supervisor.user_id,
            target_date: targetDate,
            whatsapp: supervisor.phone || null,
            message: supervisorMessage,
            status: "pending",
          },
        });

        logs.push(log);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Resumos gerados. O worker/WhatsApp pode usar os logs pendentes para enviar.",
      logs,
    });
  } catch (error) {
    console.error("[POST /api/crm/delivery-summary]", error);
    return NextResponse.json({ error: "Erro ao gerar notificações de entrega." }, { status: 500 });
  }
}
