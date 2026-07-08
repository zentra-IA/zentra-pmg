-- Cotador PMG IA V3
-- Catálogo inteligente + preços diários + histórico de cotações

CREATE TABLE IF NOT EXISTS public.quote_catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid NULL,
  code text NOT NULL,
  official_name text NOT NULL,
  normalized_name text NOT NULL,
  category text NULL,
  subcategory text NULL,
  brand text NULL,
  package_type text NULL,
  weight_value numeric NULL,
  weight_unit text NULL,
  default_sell_unit text NULL,
  synonyms text[] DEFAULT ARRAY[]::text[],
  forbidden_terms text[] DEFAULT ARRAY[]::text[],
  attributes jsonb DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_catalog_products_company_code_unique UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_quote_catalog_products_company ON public.quote_catalog_products(company_id);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_products_code ON public.quote_catalog_products(code);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_products_category ON public.quote_catalog_products(category);
CREATE INDEX IF NOT EXISTS idx_quote_catalog_products_normalized_name ON public.quote_catalog_products(normalized_name);

CREATE TABLE IF NOT EXISTS public.quote_daily_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid NULL,
  catalog_product_id uuid NULL REFERENCES public.quote_catalog_products(id) ON DELETE SET NULL,
  code text NOT NULL,
  pdf_name text NULL,
  product_name_from_pdf text NOT NULL,
  sell_unit text NOT NULL,
  price numeric(12,2) NOT NULL,
  table_date date NOT NULL DEFAULT CURRENT_DATE,
  raw_line text NULL,
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_daily_prices_company_code_date_unique UNIQUE(company_id, code, table_date)
);

CREATE INDEX IF NOT EXISTS idx_quote_daily_prices_company ON public.quote_daily_prices(company_id);
CREATE INDEX IF NOT EXISTS idx_quote_daily_prices_code ON public.quote_daily_prices(code);
CREATE INDEX IF NOT EXISTS idx_quote_daily_prices_date ON public.quote_daily_prices(table_date);

CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid NULL,
  user_id uuid NULL,
  client_id text NULL,
  client_name text NULL,
  title text NULL,
  request_text text NOT NULL,
  output_text text NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_total numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  price_display_mode text NOT NULL DEFAULT 'unit_and_total',
  table_date date NULL,
  status text NOT NULL DEFAULT 'generated',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotes_company ON public.quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON public.quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON public.quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON public.quotes(created_at);

CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  catalog_product_id uuid NULL REFERENCES public.quote_catalog_products(id) ON DELETE SET NULL,
  code text NULL,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  sell_unit text NOT NULL,
  display_unit text NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  kg_price numeric(12,2) NULL,
  box_price numeric(12,2) NULL,
  discount_percent numeric(8,3) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.quote_items(quote_id);
