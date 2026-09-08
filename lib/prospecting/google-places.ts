export type GooglePlacePreview = {
  id: string;
  name: string;
  address: string;
  primaryType: string | null;
  mapsUri: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  internationalPhone: string | null;
  website: string | null;
  businessStatus: string | null;
};

type GoogleDisplayName = {
  text?: string;
  languageCode?: string;
};

type GooglePlaceRaw = {
  id?: string;
  displayName?: GoogleDisplayName;
  formattedAddress?: string;
  primaryType?: string;
  googleMapsUri?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  businessStatus?: string;
};

type TextSearchResponse = {
  places?: GooglePlaceRaw[];
  nextPageToken?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function getApiKey() {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();

  if (!key) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY não configurada no ambiente do servidor."
    );
  }

  return key;
}

function mapPlace(raw: GooglePlaceRaw): GooglePlacePreview | null {
  const id = String(raw?.id || "").trim();
  if (!id) return null;

  return {
    id,
    name: String(raw?.displayName?.text || "").trim(),
    address: String(raw?.formattedAddress || "").trim(),
    primaryType: raw?.primaryType ? String(raw.primaryType) : null,
    mapsUri: raw?.googleMapsUri ? String(raw.googleMapsUri) : null,
    latitude:
      typeof raw?.location?.latitude === "number"
        ? raw.location.latitude
        : null,
    longitude:
      typeof raw?.location?.longitude === "number"
        ? raw.location.longitude
        : null,
    phone: raw?.nationalPhoneNumber
      ? String(raw.nationalPhoneNumber)
      : null,
    internationalPhone: raw?.internationalPhoneNumber
      ? String(raw.internationalPhoneNumber)
      : null,
    website: raw?.websiteUri ? String(raw.websiteUri) : null,
    businessStatus: raw?.businessStatus
      ? String(raw.businessStatus)
      : null,
  };
}

async function googleFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        `Google Places respondeu HTTP ${response.status}.`;
      throw new Error(message);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchGooglePlaces(input: {
  textQuery: string;
  pageSize?: number;
  pageToken?: string | null;
}) {
  const pageSize = Math.max(1, Math.min(20, Number(input.pageSize || 20)));

  const body: Record<string, unknown> = {
    textQuery: input.textQuery,
    pageSize,
    languageCode: "pt-BR",
    regionCode: "BR",
  };

  if (input.pageToken) {
    body.pageToken = input.pageToken;
  }

  const payload = (await googleFetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.primaryType",
          "places.googleMapsUri",
          "places.location",
          "nextPageToken",
        ].join(","),
      },
      body: JSON.stringify(body),
    }
  )) as TextSearchResponse;

  const places = (payload?.places || [])
    .map(mapPlace)
    .filter((item): item is GooglePlacePreview => Boolean(item));

  return {
    places,
    nextPageToken: payload?.nextPageToken || null,
  };
}

export async function getGooglePlaceDetails(placeId: string) {
  const safePlaceId = encodeURIComponent(String(placeId || "").trim());

  if (!safePlaceId) {
    throw new Error("Place ID inválido.");
  }

  const payload = (await googleFetch(
    `https://places.googleapis.com/v1/places/${safePlaceId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": [
          "id",
          "displayName",
          "formattedAddress",
          "primaryType",
          "googleMapsUri",
          "location",
          "nationalPhoneNumber",
          "internationalPhoneNumber",
          "websiteUri",
          "businessStatus",
        ].join(","),
      },
    }
  )) as GooglePlaceRaw;

  const mapped = mapPlace(payload);

  if (!mapped) {
    throw new Error("O Google não retornou detalhes para este estabelecimento.");
  }

  return mapped;
}

export async function enrichGooglePlaces(
  placeIds: string[],
  concurrency = 4
) {
  const ids = Array.from(
    new Set(
      placeIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  const result = new Map<string, GooglePlacePreview | null>();

  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);

    const resolved = await Promise.all(
      batch.map(async (placeId) => {
        try {
          const place = await getGooglePlaceDetails(placeId);
          return [placeId, place] as const;
        } catch {
          return [placeId, null] as const;
        }
      })
    );

    for (const [placeId, place] of resolved) {
      result.set(placeId, place);
    }
  }

  return result;
}

export function normalizePhone(value?: string | null) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  return digits;
}

export function makeWhatsAppLink(value?: string | null) {
  const local = normalizePhone(value);
  if (!local) return null;

  const withCountry = local.startsWith("55") ? local : `55${local}`;
  return `https://wa.me/${withCountry}`;
}
