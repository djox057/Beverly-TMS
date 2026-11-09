import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { publishChatContext, type ChatKind } from "@/lib/chatbot";

export function useChatRecord(kind: ChatKind,record: { id: string } | null,opened: boolean,label: string) {
  useEffect(() => {
    if (opened && record?.id) publishChatContext({ kind,id: record.id,label });
    return () => { if (opened && record?.id) publishChatContext(null); };
  },[kind,record?.id,opened,label]);
}
export function useChatRecordLink<T extends { id: string }>(records: T[] | undefined,open: (record: T) => void,setTab: (tab: string) => void) {
  const [params] = useSearchParams();
  const location = useLocation();
  const last = useRef("");
  const id = params.get("record");
  const tab = params.get("tab") === "files" ? "files" : "info";
  useEffect(() => {
    if (!id) { last.current = ""; return; }
    const key = `${id}:${tab}:${location.key}`;
    if (last.current === key) return;
    const record = records?.find(r => r.id === id);
    if (record) { last.current = key; open(record); setTab(tab); }
  },[id,tab,records,open,setTab,location.key]);
}
