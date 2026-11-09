import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/AuthContext";
import { chatbotRequest, type ChatContext, type ChatReply } from "@/lib/chatbot";

type Message = { id: string; role: "user" | "assistant"; text: string; reply?: ChatReply; error?: boolean };
type State = { enabled: boolean; open: boolean; setOpen: (v: boolean) => void; context: ChatContext | null; messages: Message[]; busy: boolean; send: (text: string, selected?: ChatContext) => Promise<void>; clear: () => void };
const ChatbotContext = createContext<State | null>(null);
export function ChatbotProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  const location = useLocation();
  const [open,setOpen] = useState(false);
  const [context,setContext] = useState<ChatContext | null>(null);
  const [lastRecord,setLastRecord] = useState<ChatContext | null>(null);
  const [messages,setMessages] = useState<Message[]>([]);
  const [busy,setBusy] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const owner = useRef(user?.id);
  owner.current = user?.id;
  const access = useQuery({ queryKey: ["chatbot-access",user?.id], enabled: !!user, queryFn: () => chatbotRequest<{ enabled: boolean; admin: boolean }>({ action: "access" }), staleTime: 30_000, gcTime: 0, refetchOnWindowFocus: true });
  const enabled = !!user && access.data?.enabled === true;
  function clear() { generation.current++; pending.current = false; setBusy(false); setMessages([]); setLastRecord(null); }
  useEffect(() => { clear(); setOpen(false); setContext(null); },[user?.id]);
  useEffect(() => { if (!enabled) { clear(); setOpen(false); } },[enabled]);
  useEffect(() => {
    const match = location.pathname.match(/^\/edit-order\/([\da-f-]{36})$/i);
    const truck = location.pathname.match(/^\/live-oil-change\/([\da-f-]{36})$/i);
    setContext(match ? { kind: "order",id: match[1],label: "Load" } : truck ? { kind: "truck",id: truck[1],label: "Truck" } : null);
  },[location.pathname]);
  useEffect(() => {
    const listener = (event: Event) => setContext((event as CustomEvent<ChatContext | null>).detail);
    window.addEventListener("tms-chat-context",listener);
    return () => window.removeEventListener("tms-chat-context",listener);
  },[]);
  async function send(text: string, selected?: ChatContext) {
    if (!enabled || pending.current || !text.trim()) return;
    pending.current = true; setBusy(true);
    const token = generation.current;
    const userId = user?.id;
    setMessages(old => [...old.slice(-39), { id: crypto.randomUUID(),role: "user",text }]);
    try {
      // No conversation transcripts or previous amounts go to the model/backend.
      const reply = await chatbotRequest<ChatReply>({ message: text,context: context || lastRecord,selection: selected });
      if (generation.current !== token || owner.current !== userId) return;
      if (reply.record) setLastRecord(reply.record);
      setMessages(old => [...old,{ id: crypto.randomUUID(),role: "assistant",text: reply.message,reply }]);
    } catch (error) {
      if (generation.current !== token || owner.current !== userId) return;
      const message = error instanceof Error ? error.message : "Assistant is unavailable.";
      if (message === "Chatbot access is disabled") { clear(); setOpen(false); await access.refetch(); }
      else setMessages(old => [...old,{ id: crypto.randomUUID(),role: "assistant",text: message,error: true }]);
    } finally {
      if (generation.current === token) { pending.current = false; setBusy(false); }
    }
  }
  return <ChatbotContext.Provider value={{ enabled,open,setOpen,context: context || lastRecord,messages,busy,send,clear }}>{children}</ChatbotContext.Provider>;
}
export function useChatbot() {
  const state = useContext(ChatbotContext);
  if (!state) throw new Error("ChatbotProvider is required");
  return state;
}
