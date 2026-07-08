export type FeatureKey =
  | "cardapio"
  | "produtos"
  | "categorias"
  | "adicionais"
  | "combos"
  | "cupons"
  | "pdv"
  | "pedidos"
  | "crm"
  | "inbox"
  | "chatbot_ia"
  | "radar"
  | "disparo"
  | "campanhas_simples"
  | "bi"
  | "erp"
  | "estoque"
  | "email_marketing"
  | "criativos_ia"
  | "campanhas_avancadas"
  | "ficha_tecnica_ia"
  | "relatorios_completos";

export function isFeatureEnabled(
  features: any[],
  grants: any[],
  feature: FeatureKey
) {
  const fromPlan = features?.some(
    (item) => item.feature === feature && item.enabled
  );

  const fromGrant = grants?.some((item) => {
    if (item.feature !== feature || !item.active) return false;
    if (!item.expires_at) return true;
    return new Date(item.expires_at) > new Date();
  });

  return Boolean(fromPlan || fromGrant);
}

export function getFeatureLimit(features: any[], feature: string) {
  const item = features?.find((f) => f.feature === feature && f.enabled);
  return Number(item?.limit_value || 0);
}