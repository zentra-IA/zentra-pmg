export type ID = string;

export type QuoteInputLine = {
  raw: string;
  quantity?: number;
  unit?: string;
  product?: string;
  brand?: string;
  category?: string;
  line?: string;
  discount?: number;
};

export type CatalogProduct = {
  id: ID;
  companyId: ID;
  code: string;
  descricaoOriginal: string;

  produto: string;
  marca?: string;
  categoria?: string;
  familia?: string;
  subtipo?: string;
  linha?: string;
  sabor?: string;
  embalagem?: string;

  vendePor?: string;
  peso?: number;
  pesoPeca?: number;
  pesoPacote?: number;
  pesoCaixa?: number;
  pecasCaixa?: number;
  pacotesCaixa?: number;

  aliases: string[];
  keywords: string[];
  searchText: string;

  price?: number;
};

export type SearchCandidate = {
  product: CatalogProduct;
  score: number;
  reasons: string[];
};

export type ResolvedQuoteItem = {
  input: QuoteInputLine;
  selected?: CatalogProduct;
  suggestions: SearchCandidate[];
  confidence: number;
  quantity: number;
  unit: string;
  convertedQuantity?: number;
  convertedUnit?: string;
  unitPrice?: number;
  subtotal?: number;
  needsReview: boolean;
  message?: string;
};

export type QuoteResult = {
  items: ResolvedQuoteItem[];
  total: number;
  needsReview: boolean;
};