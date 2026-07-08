export function getActiveCompanyId() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("active_company_id");
}