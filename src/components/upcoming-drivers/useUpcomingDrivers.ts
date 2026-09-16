import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { UPCOMING_DRIVERS_ROLES } from "@/lib/upcomingDriversAccess";
import { addDays, reconcileRows, SUMMARY_FIELDS, type Candidate, type CandidateFields, type CandidateSummary, type References } from "./model";

// Isolate the new migration's types until the generated global schema is refreshed.
const db: SupabaseClient = supabase;
export const candidateKey = (id: string) => ["upcoming-driver-detail",id];
export const historyKey = (id: string) => ["upcoming-driver-history",id];

async function allPages<T>(getPage: (from: number, to: number) => PromiseLike<{data: unknown; error: {message: string} | null}>): Promise<T[]> {
  const result: T[]=[];
  for(let from=0;from<10000;from+=500) {
    const {data,error}=await getPage(from,from+499);
    if(error) throw new Error(error.message);
    const rows=(data ?? []) as T[]; result.push(...rows);
    if(rows.length<500) return result;
  }
  throw new Error("Too many records for this view. Archive older unscheduled entries.");
}

export async function fetchCandidate(id: string): Promise<Candidate> {
  const {data,error}=await db.from("upcoming_drivers").select("*").eq("id",id).single();
  if(error) throw error;
  return data as Candidate;
}
export async function saveCandidate(id: string, fields: Partial<CandidateFields> & {archived?: boolean}, version?: number): Promise<Candidate> {
  const request=version===undefined
    ? db.from("upcoming_drivers").insert({id,...fields})
    : db.from("upcoming_drivers").update(fields).eq("id",id).eq("version",version);
  const {data,error}=await request.select("*").maybeSingle();
  if(error) {
    // Retrying a create after a lost response must not create a second candidate.
    if(version===undefined && error.code==="23505") return fetchCandidate(id);
    throw error;
  }
  if(!data) throw new Error("This entry changed while you were editing, or your access changed. Your draft is still here. Reload the latest entry before saving again.");
  return data as Candidate;
}

export async function deleteCandidate(id: string): Promise<void> {
  const {error}=await db.from("upcoming_drivers").delete().eq("id",id);
  if(error) throw error;
}

export function useUpcomingDrivers(week: string, archived: boolean) {
  const {user,getPrimaryRole}=useAuthContext();
  const role=getPrimaryRole();
  const canView=!!user && !!role && UPCOMING_DRIVERS_ROLES.includes(role);
  const canEdit=canView && role!=="chicago_management";
  const canArchive=!!role && ["admin","manager","supervisor"].includes(role);
  const canDelete=canEdit && !!role && ["admin","manager","supervisor","recruiting"].includes(role);
  const [visible,setVisible]=useState(document.visibilityState!=="hidden");
  const [live,setLive]=useState("Connecting");
  const qc=useQueryClient();
  const key=["upcoming-drivers-board",user?.id,week,archived];
  useEffect(()=>{
    const update=()=>setVisible(document.visibilityState!=="hidden");
    document.addEventListener("visibilitychange",update);
    return ()=>document.removeEventListener("visibilitychange",update);
  },[]);
  const query=useQuery({
    queryKey:key, enabled:canView && visible,
    queryFn:()=>allPages<CandidateSummary>((from,to)=>db.from("upcoming_drivers").select(SUMMARY_FIELDS)
      .eq("archived",archived).or(`arrival_date.is.null,and(arrival_date.gte.${week},arrival_date.lte.${addDays(week,6)})`)
      .order("id").range(from,to)),
    staleTime:60000, refetchOnWindowFocus:false,
  });
  const references=useQuery({
    queryKey:["upcoming-drivers-references",user?.id],enabled:canView && visible,staleTime:600000,
    queryFn:async ():Promise<References>=>{
      const [staff,trucks,companies]=await Promise.all([
        db.rpc("upcoming_driver_staff"),
        allPages<References["trucks"][number]>((from,to)=>db.from("trucks").select("id,truck_number").order("id").range(from,to)),
        allPages<References["companies"][number]>((from,to)=>db.from("companies").select("id,name").order("id").range(from,to)),
      ]);
      if(staff.error) throw staff.error;
      return {staff:staff.data ?? [],trucks,companies};
    },
  });
  useEffect(()=>{
    if(!canView || !visible) {setLive("Paused");return;}
    let stopped=false, busy=false, subscribed=false, failures=0, timer:ReturnType<typeof setTimeout> | undefined;
    const pending=new Set<string>();
    const boardKey=["upcoming-drivers-board",user?.id,week,archived];
    const flush=async()=>{
      if(stopped || busy || !pending.size) return;
      // A full refresh must finish before row patches, to avoid a stale response overwriting them.
      if(qc.isFetching({queryKey:boardKey})) {timer=setTimeout(flush,250);return;}
      busy=true;
      const ids=[...pending].slice(0,100); ids.forEach(id=>pending.delete(id));
      try {
        const {data,error}=await db.from("upcoming_drivers").select(SUMMARY_FIELDS).in("id",ids);
        if(error) throw error;
        if(stopped) return;
        // A user-triggered refresh may have started during this request.
        if(qc.isFetching({queryKey:boardKey})) {ids.forEach(id=>pending.add(id));return;}
        qc.setQueryData<CandidateSummary[]>(boardKey,current=>reconcileRows(current ?? [],data ?? [],ids,week,archived));
        failures=0;
        if(subscribed) setLive("Live");
        for(const id of ids) {
          void qc.invalidateQueries({queryKey:candidateKey(id)});
          void qc.invalidateQueries({queryKey:historyKey(id)});
        }
      } catch {
        setLive("Updates interrupted");
        // Keep IDs for a bounded delayed retry, without downloading the whole board.
        failures++;
        ids.forEach(id=>pending.add(id));
      } finally {
        busy=false;
        if(!stopped && pending.size && failures<3) timer=setTimeout(flush,1500);
      }
    };
    setLive("Connecting");
    const channel=db.channel("upcoming-drivers",{config:{private:true}})
      .on("broadcast",{event:"changed"},({payload})=>{
        if(typeof payload?.id!=="string" || !/^[0-9a-f-]{36}$/i.test(payload.id)) return;
        failures=0;
        pending.add(payload.id);
        if(timer) clearTimeout(timer);
        timer=setTimeout(flush,250);
      }).subscribe(status=>{
        if(stopped) return;
        if(status==="SUBSCRIBED") {
          subscribed=true;
          failures=0;
          setLive("Live");
          void qc.invalidateQueries({queryKey:boardKey},{cancelRefetch:false});
          if(pending.size) timer=setTimeout(flush,250);
        } else if(status==="CHANNEL_ERROR" || status==="TIMED_OUT" || status==="CLOSED") {subscribed=false;setLive("Updates interrupted");}
      });
    return ()=>{stopped=true;if(timer)clearTimeout(timer);void db.removeChannel(channel);};
  },[canView,visible,user?.id,week,archived,qc]);

  const acceptSaved=(row:Candidate)=>{
    qc.setQueryData<CandidateSummary[]>(key,current=>reconcileRows(current ?? [],[row],[row.id],week,archived));
    qc.setQueryData(candidateKey(row.id),row);
    void qc.invalidateQueries({queryKey:historyKey(row.id)});
    // Mark other weeks/views stale without fetching inactive boards.
    void qc.invalidateQueries({queryKey:["upcoming-drivers-board"],refetchType:"none"});
  };
  const removeCandidate=async(id:string)=>{
    await deleteCandidate(id);
    qc.setQueryData<CandidateSummary[]>(key,current=>(current ?? []).filter(r=>r.id!==id));
    qc.removeQueries({queryKey:candidateKey(id)});
    void qc.invalidateQueries({queryKey:["upcoming-drivers-board"],refetchType:"none"});
  };
  return {query,references,live,canEdit,canArchive,canDelete,acceptSaved,removeCandidate};
}

export function useCandidateHistory(id: string | null, enabled: boolean) {
  return useQuery({queryKey:historyKey(id ?? ""),enabled:!!id && enabled,
    queryFn:async()=>{
      const {data,error}=await db.from("upcoming_driver_history").select("id,actor_id,actor_name,changed_at,operation,changes")
        .eq("upcoming_driver_id",id!).order("changed_at",{ascending:false}).limit(20);
      if(error) throw error;
      return data as {id:string;actor_id:string;actor_name:string;changed_at:string;operation:string;changes:Record<string,{before:unknown;after:unknown}>}[];
    },
  });
}
