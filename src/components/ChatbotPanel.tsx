import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Download, ExternalLink, Loader2, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatbot } from "@/contexts/ChatbotContext";
import { chatbotRequest, type ChatFile } from "@/lib/chatbot";
import { useToast } from "@/hooks/use-toast";

export function ChatbotPanel() {
  const chat = useChatbot();
  const [draft,setDraft] = useState("");
  const [opening,setOpening] = useState<string | null>(null);
  const [visibleFiles,setVisibleFiles] = useState<Record<string,number>>({});
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const lastUi = [...chat.messages].reverse().find(m => m.reply?.ui)?.reply?.ui || {};
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); },[chat.messages,chat.busy]);
  useEffect(() => { if (chat.open) input.current?.focus(); },[chat.open]);
  useEffect(() => { if (!chat.enabled) { setDraft(""); setVisibleFiles({}); } },[chat.enabled]);
  async function openFile(file: ChatFile,download = false) {
    if (opening) return;
    // Reserve a window during the click so browser popup blocking doesn't hide the result.
    const target = window.open("about:blank","_blank");
    if (target) target.opener = null;
    setOpening(file.id);
    try {
      const { url } = await chatbotRequest<{ url: string }>({ action: "file",kind: file.kind,recordId: file.recordId,fileId: file.id,download });
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error("Invalid document link");
      if (target) target.location.href = url;
      else { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.click(); }
    } catch (error) { target?.close(); toast({ title: "Could not open file",description: error instanceof Error ? error.message : "Please try again.",variant: "destructive" }); }
    finally { setOpening(null); }
  }
  if (!chat.enabled) return null;
  if (!chat.open) return <Button className="fixed bottom-5 right-5 z-[100] rounded-full shadow-lg h-12 gap-2" onClick={() => chat.setOpen(true)} aria-label="Open TMS assistant"><Bot className="h-5 w-5" />Assistant</Button>;
  return <section role="dialog" aria-label="TMS assistant" className="fixed bottom-4 right-4 z-[100] flex max-h-[min(720px,90dvh)] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-background text-foreground shadow-2xl">
    <header className="flex items-center gap-2 border-b p-3"><Bot className="h-5 w-5" /><h2 className="flex-1 font-semibold">TMS Assistant</h2><Button size="icon" variant="ghost" title={lastUi.clear || "Clear chat"} aria-label="Clear chat" onClick={() => { chat.clear(); setDraft(""); setVisibleFiles({}); }}><Trash2 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label="Close assistant" onClick={() => chat.setOpen(false)}><X className="h-4 w-4" /></Button></header>
    <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{chat.context ? `${lastUi.current || "Current record"}: ${chat.context.kind} · ${chat.context.label}` : "No record selected"}</div>
    <div className="min-h-[220px] flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
      {!chat.messages.length && <div className="space-y-3 py-3 text-sm"><p className="text-muted-foreground">Find details and documents. Answers include a TMS link and where to find them manually.</p>{["What is the yard address?","Give me this truck’s cab card","Where can I find a driver’s CDL?"].map(q => <button key={q} className="block w-full rounded-lg border p-2 text-left hover:bg-muted" onClick={() => chat.send(q)}>{q}</button>)}</div>}
      {chat.messages.map(m => <div key={m.id} className={`rounded-lg p-3 text-sm ${m.role === "user" ? "ml-6 bg-primary text-primary-foreground" : m.error ? "bg-destructive/10 text-destructive" : "mr-2 bg-muted"}`}>
        {m.reply?.record && <div className="mb-1 font-semibold">{m.reply.record.label}</div>}<p className="whitespace-pre-wrap">{m.text}</p>
        {!!m.reply?.facts?.length && <dl className="mt-2 space-y-1">{m.reply.facts.map((f,i) => <div key={i} className="flex flex-wrap justify-between gap-x-3"><dt className="text-muted-foreground capitalize">{f.label}</dt><dd className={f.expired ? "text-destructive" : "break-all"}>{typeof f.value === "boolean" ? (f.value ? m.reply?.ui?.yes || "Yes" : m.reply?.ui?.no || "No") : String(f.value)}{f.expired ? ` · ${m.reply?.ui?.expired || "Expired"}` : ""}</dd></div>)}</dl>}
        {m.reply?.choices?.map(c => <Button key={c.id} variant="outline" className="mt-2 mr-1 h-auto whitespace-normal text-left" disabled={chat.busy} onClick={() => { const previous = chat.messages.slice(0,chat.messages.indexOf(m)).reverse().find(v => v.role === "user"); if (previous) chat.send(previous.text,c); }}>{c.label}</Button>)}
        {m.reply?.files?.slice(0,visibleFiles[m.id] || 8).map(f => <div key={f.id} className="mt-2 flex items-center gap-1 rounded border bg-background p-2"><span className="min-w-0 flex-1 break-all text-xs">{f.name}</span><Button size="icon" variant="ghost" aria-label={m.reply?.ui?.view || "Open file"} title={m.reply?.ui?.view || "Open file"} disabled={!!opening} onClick={() => openFile(f)}>{opening === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}</Button><Button size="icon" variant="ghost" aria-label={m.reply?.ui?.download || "Download"} title={m.reply?.ui?.download || "Download"} disabled={!!opening} onClick={() => openFile(f,true)}><Download className="h-4 w-4" /></Button></div>)}
        {(m.reply?.files?.length || 0) > (visibleFiles[m.id] || 8) && <Button variant="link" className="h-7 px-0" onClick={() => setVisibleFiles(old => ({ ...old,[m.id]: (old[m.id] || 8)+8 }))}>{m.reply?.ui?.more || "More files"}</Button>}
        {m.reply?.notice && <p className="mt-2 text-xs text-muted-foreground">{m.reply.notice}</p>}
        {m.reply?.links?.filter(l => l.href.startsWith("/") && !l.href.startsWith("//")).map(l => <Link key={l.href} to={l.href} className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline">{l.label}<ExternalLink className="h-3 w-3" /></Link>)}
        {!!m.reply?.steps?.length && <div className="mt-2 border-t pt-2 text-xs text-muted-foreground"><span className="font-medium">{m.reply.ui?.manual || "Find it manually"}: </span>{m.reply.steps.join(" → ")}</div>}
      </div>)}
      {chat.busy && <Loader2 aria-label="Finding information" className="h-5 w-5 animate-spin text-muted-foreground" />}<div ref={end} />
    </div>
    <form className="flex gap-2 border-t p-3" onSubmit={e => { e.preventDefault(); const q = draft.trim(); if (q && !chat.busy) { setDraft(""); chat.send(q); } }}><Input ref={input} value={draft} onChange={e => setDraft(e.target.value)} maxLength={1500} placeholder={lastUi.placeholder || "Ask about a driver, vehicle, or file…"} aria-label="Message" /><Button size="icon" type="submit" disabled={chat.busy || !draft.trim()} aria-label={lastUi.send || "Send"}><Send className="h-4 w-4" /></Button></form>
  </section>;
}
