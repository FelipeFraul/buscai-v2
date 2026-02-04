import { apiClient } from "@/lib/api/client";
import { createQuery } from "@/lib/api/hooks";

export type MessageHistoryItem = {
  id: string;
  companyId: string;
  direction: "inbound" | "outbound";
  peerE164: string;
  providerMessageId?: string | null;
  text: string;
  searchId?: string | null;
  meta?: unknown;
  createdAt: string;
};

export type MessagesHistoryResponse = {
  items: MessageHistoryItem[];
  nextOffset?: number | null;
};

export type MessagesHistoryQuery = {
  limit?: number;
  offset?: number;
  peerE164?: string;
  direction?: "inbound" | "outbound";
  from?: string;
  to?: string;
};

export const useMessagesHistory = (query: MessagesHistoryQuery) =>
  createQuery<MessagesHistoryResponse, MessagesHistoryQuery>({
    queryKey: (variables) => ["messages-history", variables],
    queryFn: async (variables) => {
      const response = await apiClient.get("/messages/history", { params: variables });
      return response.data as MessagesHistoryResponse;
    },
  })(query);
