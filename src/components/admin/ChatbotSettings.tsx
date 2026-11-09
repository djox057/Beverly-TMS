import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { chatbotRequest, type ChatContext, type ChatKind } from "@/lib/chatbot";
import { restrictedRequest } from "../../../supabase/functions/_shared/chatbotPolicy";

type Faq = { id?: string; question: string; answer: string; answer_sr: string; translations: Record<string,string>; keywords: string[]; page_path: string; published: boolean };
type ReviewResult = { record?: ChatContext; choices?: ChatContext[]; files?: { id: string; name: string; allowed: boolean; reviewed: boolean; locked?: boolean }[] };
const emptyFaq: Faq = { question: "",answer: "",answer_sr: "",translations: {},keywords: [],page_path: "/info",published: true };
export function ChatbotSettings() {
  const [expanded,setExpanded] = useState(false);
  const [draft,setDraft] = useState<Faq>({ ...emptyFaq });
  const [saving,setSaving] = useState(false);
  const [translationLanguage,setTranslationLanguage] = useState("es");
  const [kind,setKind] = useState<ChatKind>("driver");
  const [query,setQuery] = useState("");
  const [review,setReview] = useState<ReviewResult | null>(null);
  const [reviewing,setReviewing] = useState(false);
  const client = useQueryClient();
  const { toast } = useToast();
  const faqs = useQuery({ queryKey: ["chatbot-admin-faq"],enabled: expanded,queryFn: async () => {
    const { data,error } = await supabase.from("chatbot_faq" as never).select("id,question,answer,answer_sr,translations,keywords,page_path,published").order("question");
    if (error) throw error;
    return data as unknown as Faq[];
  } });
  function failed(error: unknown) { toast({ title: "Could not save chatbot settings",description: error instanceof Error ? error.message : "Please try again.",variant: "destructive" }); }
  async function saveFaq() {
    if (!draft.question.trim() || !draft.answer.trim()) return;
    if (restrictedRequest([draft.question,draft.answer,draft.answer_sr,...Object.values(draft.translations || {}),...draft.keywords].join(" "))) { failed(new Error("FAQ cannot contain restricted information, notes, or credentials.")); return; }
    if (!/^\/(?!\/)[\w/?=&%-]*$/.test(draft.page_path)) { failed(new Error("Enter a TMS page path, such as /info.")); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("chatbot_faq" as never).upsert({ ...draft,updated_at: new Date().toISOString() } as never);
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ["chatbot-admin-faq"] });
      setDraft({ ...emptyFaq }); toast({ title: "FAQ saved" });
    } catch (error) { failed(error); } finally { setSaving(false); }
  }
  async function findFiles(value = query) {
    if (!value.trim()) return;
    setReviewing(true);
    try { setReview(await chatbotRequest<ReviewResult>({ action: "review_files",kind,query: value })); }
    catch (error) { failed(error); } finally { setReviewing(false); }
  }
  async function reviewFile(id: string,allowed: boolean) {
    setReviewing(true);
    try { await chatbotRequest({ action: "review_file",kind,fileId: id,allowed }); await findFiles(review?.record?.id || query); }
    catch (error) { failed(error); } finally { setReviewing(false); }
  }
  return <div className="rounded-lg border bg-card p-4">
    <Button variant="outline" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>Assistant FAQ & document access</Button>
    {expanded && <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <section className="space-y-3"><h3 className="font-semibold">Published FAQ</h3><p className="text-xs text-muted-foreground">Only publish information every enabled chatbot user may access.</p>
        {faqs.isError && <p role="alert" className="text-destructive">Could not load FAQ. <button onClick={() => faqs.refetch()} className="underline">Retry</button></p>}
        <div className="max-h-40 space-y-1 overflow-y-auto">{faqs.data?.map(f => <button key={f.id} className="block w-full rounded border p-2 text-left text-sm hover:bg-muted" onClick={() => setDraft(f)}>{f.question}{!f.published && " · Hidden"}</button>)}</div>
        <Label htmlFor="faq-question">Question</Label><Input id="faq-question" value={draft.question} maxLength={200} onChange={e => setDraft(v => ({ ...v,question: e.target.value }))} />
        <Label htmlFor="faq-answer">Answer</Label><Textarea id="faq-answer" value={draft.answer} maxLength={2000} onChange={e => setDraft(v => ({ ...v,answer: e.target.value }))} />
        <Label htmlFor="faq-answer-sr">Serbian answer (optional)</Label><Textarea id="faq-answer-sr" value={draft.answer_sr} maxLength={2000} onChange={e => setDraft(v => ({ ...v,answer_sr: e.target.value }))} />
        <Label htmlFor="faq-language">Other saved translation (language code)</Label><Input id="faq-language" value={translationLanguage} maxLength={8} onChange={e => setTranslationLanguage(e.target.value.toLowerCase().replace(/[^a-z-]/g,""))} placeholder="es, ru, de…" /><Textarea aria-label="Translated FAQ answer" value={draft.translations?.[translationLanguage] || ""} maxLength={2000} disabled={!translationLanguage} onChange={e => setDraft(v => ({ ...v,translations: { ...v.translations,[translationLanguage]: e.target.value } }))} />
        <Label htmlFor="faq-keywords">Search keywords (comma separated)</Label><Input id="faq-keywords" value={draft.keywords.join(",")} onChange={e => setDraft(v => ({ ...v,keywords: e.target.value.split(",").map(s => s.trim()) }))} />
        <Label htmlFor="faq-page">TMS page link</Label><Input id="faq-page" value={draft.page_path} maxLength={200} onChange={e => setDraft(v => ({ ...v,page_path: e.target.value }))} />
        <div className="flex items-center gap-2"><Switch id="faq-published" checked={draft.published} onCheckedChange={published => setDraft(v => ({ ...v,published }))} /><Label htmlFor="faq-published">Published</Label></div>
        <div className="flex gap-2"><Button disabled={saving || !draft.question.trim() || !draft.answer.trim()} onClick={saveFaq}>Save FAQ</Button><Button variant="outline" onClick={() => setDraft({ ...emptyFaq })}>New FAQ</Button></div>
      </section>
      <section className="space-y-3"><h3 className="font-semibold">Document access review</h3><p className="text-xs text-muted-foreground">Recognized document types are available automatically. Review generic scans, applications, agreements, and other documents before allowing them. Salary, banking, credentials, and internal-note categories stay blocked.</p>
        <Label htmlFor="review-kind">Record type</Label><select id="review-kind" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={kind} onChange={e => { setKind(e.target.value as ChatKind); setReview(null); }}>{["driver","truck","trailer","order","company"].map(k => <option key={k}>{k}</option>)}</select>
        <Label htmlFor="review-search">Driver/company name or vehicle/load number</Label><div className="flex gap-2"><Input id="review-search" value={query} onChange={e => setQuery(e.target.value)} maxLength={100} /><Button disabled={reviewing || !query.trim()} onClick={() => findFiles()}>Find files</Button></div>
        {review?.choices?.map(c => <Button key={c.id} variant="outline" disabled={reviewing} onClick={() => findFiles(c.id)}>{c.label}</Button>)}
        {review?.choices?.length === 0 && <p className="text-sm">No matching record.</p>}
        {review?.record && <h4 className="font-medium">{review.record.label}</h4>}
        <div className="max-h-[480px] space-y-2 overflow-y-auto">{review?.files?.map(f => <div key={f.id} className="rounded border p-2 text-sm"><p className="break-all">{f.name}</p><div className="mt-2 flex items-center gap-2"><span className="flex-1 text-xs text-muted-foreground">{f.locked ? "Restricted" : f.allowed ? "Available" : "Hidden"}{f.reviewed ? " · Reviewed" : ""}</span><Button size="sm" variant="outline" disabled={reviewing || f.locked} onClick={() => reviewFile(f.id,!f.allowed)}>{f.allowed ? "Hide" : "Allow reviewed file"}</Button></div></div>)}</div>
      </section>
    </div>}
  </div>;
}
