import { PaymentMethod } from "@prisma/client";

type CustomerLike = {
  name?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  cep?: string | null;
};

type OrderLike = {
  id: string;
  code?: string | null;
  total: number;
  paymentMethod: PaymentMethod | string;
  changeFor?: string | null;
  observation?: string | null;
  customer?: CustomerLike | null;
};

export const DEFAULT_STORE_ADDRESS =
  "R. dos Secadouros, 292 - Vila Carmosina, São Paulo - SP, 08270-550";

export function getOrderCode(order: { id: string; code?: string | null }) {
  return order.code || `PED-${String(order.id).slice(0, 8)}`;
}

export function getCleanWhatsapp(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

export function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function getMapsAddress(customer?: CustomerLike | null) {
  if (!customer) return "";

  return [
    customer.address,
    customer.number,
    customer.neighborhood,
    customer.city,
    customer.cep,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(", ");
}

export function getFullAddress(customer?: CustomerLike | null) {
  if (!customer) return "Endereço não informado";

  const address = String(customer.address || "").trim();
  const number = String(customer.number || "").trim();
  const complement = String(customer.complement || "").trim();
  const neighborhood = String(customer.neighborhood || "").trim();
  const city = String(customer.city || "").trim();
  const cep = String(customer.cep || "").trim();

  const line1 = [address, number].filter(Boolean).join(", ");
  const line1WithComplement = [line1, complement].filter(Boolean).join(" - ");
  const line2 = [neighborhood, city].filter(Boolean).join(" - ");

  return [line1WithComplement, line2, cep ? `CEP: ${cep}` : ""]
    .filter(Boolean)
    .join(" | ");
}

export function buildMapsRouteUrl(params: {
  storeAddress: string;
  addresses: string[];
}) {
  const validAddresses = params.addresses.filter(Boolean);

  if (!validAddresses.length) return "";

  if (validAddresses.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      params.storeAddress
    )}&destination=${encodeURIComponent(validAddresses[0])}&travelmode=driving`;
  }

  const destination = validAddresses[validAddresses.length - 1];
  const waypoints = validAddresses.slice(0, -1);

  const query = new URLSearchParams({
    api: "1",
    origin: params.storeAddress,
    destination,
    travelmode: "driving",
  });

  if (waypoints.length) {
    query.set("waypoints", waypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${query.toString()}`;
}

export function sortOrdersByRouteMode<T extends { customer?: CustomerLike | null }>(
  orders: T[],
  routeMode: "NEAR_TO_FAR" | "FAR_TO_NEAR"
) {
  const sorted = [...orders].sort((a, b) => {
    const aNeighborhood = String(a.customer?.neighborhood || "").toLowerCase();
    const bNeighborhood = String(b.customer?.neighborhood || "").toLowerCase();

    if (aNeighborhood < bNeighborhood) return -1;
    if (aNeighborhood > bNeighborhood) return 1;

    const aAddress = getMapsAddress(a.customer).toLowerCase();
    const bAddress = getMapsAddress(b.customer).toLowerCase();

    if (aAddress < bAddress) return -1;
    if (aAddress > bAddress) return 1;

    return 0;
  });

  return routeMode === "FAR_TO_NEAR" ? sorted.reverse() : sorted;
}

export function buildDriverWhatsappMessage(params: {
  driverName: string;
  batchCode: string;
  mapsUrl: string;
  orders: OrderLike[];
}) {
  const lines: string[] = [];

  lines.push(`Olá, ${params.driverName}! Seguem seus pedidos para entrega:`);
  lines.push("");
  lines.push(`🛵 Lote: ${params.batchCode}`);
  lines.push(`🏪 Saída da pizzaria: ${DEFAULT_STORE_ADDRESS}`);
  lines.push("");

  params.orders.forEach((order, index) => {
    lines.push(`${index + 1}) Pedido ${getOrderCode(order)}`);
    lines.push(`Cliente: ${order.customer?.name || "Não informado"}`);
    lines.push(`Endereço: ${getFullAddress(order.customer)}`);
    lines.push(`Pagamento: ${String(order.paymentMethod || "PIX")}`);
    lines.push(`Valor: ${formatMoney(Number(order.total || 0))}`);

    if (String(order.paymentMethod) === "DINHEIRO" && order.changeFor) {
      lines.push(`Troco para: ${order.changeFor}`);
    }

    if (order.observation) {
      lines.push(`Obs: ${order.observation}`);
    }

    lines.push("");
  });

  if (params.mapsUrl) {
    lines.push("📍 Link da rota:");
    lines.push(params.mapsUrl);
    lines.push("");
  }

  lines.push("Boa entrega.");

  return lines.join("\n");
}