export function hasFeature(data: any, feature: string) {
  const fromPlan = data?.features?.some(
    (item: any) => item.feature === feature && item.enabled
  );

  const fromGrant = data?.grants?.some((item: any) => {
    if (item.feature !== feature || !item.active) return false;
    if (!item.expires_at) return true;
    return new Date(item.expires_at) > new Date();
  });

  return Boolean(fromPlan || fromGrant);
}

export function getLimit(data: any, feature: string) {
  const item = data?.features?.find(
    (f: any) => f.feature === feature && f.enabled
  );

  return Number(item?.limit_value || 0);
}