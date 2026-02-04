import { apiClient } from "./client";

export type SearchEventType = "impression" | "click_whatsapp" | "click_call";
export type OfferedByEventType =
  | "click_whatsapp"
  | "click_call"
  | "click_site"
  | "click_promotions";

export async function trackSearchEvent(
  searchId: string,
  payload: { type: SearchEventType; companyId?: string }
): Promise<void> {
  await apiClient.post(`/search/${searchId}/events`, payload);
}

export async function trackOfferedByEvent(
  configId: string,
  payload: { type: OfferedByEventType; searchId?: string }
): Promise<void> {
  await apiClient.post(`/offered-by/${configId}/events`, payload);
}
