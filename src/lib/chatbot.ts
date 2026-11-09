import { supabase } from "@/integrations/supabase/client";
export type ChatKind = "driver" | "truck" | "trailer" | "order" | "company";
export type ChatContext = { kind: ChatKind; id: string; label: string };
export type ChatFile = { id: string; name: string; kind: ChatKind; recordId: string; createdAt?: string };
export type ChatReply = {
  message: string; ui?: Record<string,string>; record?: ChatContext;
  facts?: { label: string; value: unknown; expired?: boolean }[];
  files?: ChatFile[]; notice?: string; choices?: ChatContext[];
  links?: { label: string; href: string }[]; steps?: string[];
};
export async function chatbotRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data,error } = await supabase.functions.invoke("tms-chatbot", { body });
  if (error) {
    let message = "Assistant is unavailable. Please try again.";
    try { const payload = await error.context?.json(); if (payload?.error) message = payload.error; } catch { /* No error payload */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
// Page dialogs publish only identity/context. Never include record contents in this event.
export function publishChatContext(context: ChatContext | null) {
  window.dispatchEvent(new CustomEvent("tms-chat-context", { detail: context }));
}
