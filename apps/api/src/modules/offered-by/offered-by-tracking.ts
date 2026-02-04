import crypto from "crypto";

export type OfferedByTrackingPayload = {
  configId: string;
  companyId: string;
  type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions";
  cityId?: string | null;
  nicheId?: string | null;
  searchType?: "niche" | "company" | "product";
  source?: "whatsapp" | "web" | "demo";
  exp?: number;
};

const encodeBase64Url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4 ? 4 - (normalized.length % 4) : 0;
  const padded = `${normalized}${"=".repeat(padLength)}`;
  return Buffer.from(padded, "base64").toString("utf8");
};

export const createOfferedByTrackingToken = (
  payload: OfferedByTrackingPayload,
  secret: string
) => {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  const encodedSignature = encodeBase64Url(signature);
  return `${header}.${body}.${encodedSignature}`;
};

export const verifyOfferedByTrackingToken = (
  token: string,
  secret: string
): OfferedByTrackingPayload | null => {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  const expectedEncoded = encodeBase64Url(expected);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedEncoded);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(body)) as OfferedByTrackingPayload;
    if (typeof parsed.exp === "number" && Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
