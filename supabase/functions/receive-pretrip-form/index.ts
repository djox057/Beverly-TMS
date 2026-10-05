import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { mapResponse, matchTruck, type FormFile } from "./mapping.ts";
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,"0")).join("");
const check=(r:{error:unknown})=>{if(r.error)throw new Error("TMS database operation failed");};
Deno.serve(async req=>{
 if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
 const token=req.headers.get("x-pretrip-token")??"";
 if(!/^[a-f0-9]{64}$/.test(token))return Response.json({error:"Unauthorized"},{status:401});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const connection=await db.from("pretrip_form_connection").select("id").eq("token_hash",await hash(token)).maybeSingle();
 if(connection.error||!connection.data)return Response.json({error:"Unauthorized"},{status:401});
 const state=await db.from("pretrip_form_sync").select("enabled").eq("id",true).single();
 if(state.error||!state.data?.enabled)return Response.json({error:"Imports are paused"},{status:503});
 try {
  if(Number(req.headers.get("content-length")??0)>12*1024*1024)return Response.json({error:"Request too large"},{status:413});
  const isPhoto=req.headers.get("content-type")?.startsWith("multipart/form-data");
  const body=isPhoto?await req.formData():await req.json();
  if(!isPhoto && body.action!=="photo_error") {
   if(!Array.isArray(body.headers)||!Array.isArray(body.values)||body.headers.length>200||body.values.length>200||!body.sheet_id||!Number.isInteger(body.source_row)||body.source_row<2) throw new Error("Invalid submission payload");
   const headers=body.headers.map(String), values=body.values;
   if(JSON.stringify(values).length>100000)throw new Error("Response is too large");
   const source_key=await hash(JSON.stringify([body.sheet_id,body.sheet_tab,headers,values]));
   let existing=await db.from("pretrip_form_submissions").select("*").eq("source_key",source_key).maybeSingle();check(existing);
   const trucks: {id:string;truck_number:string}[]=[];
   for(let offset=0;;offset+=1000){const r=await db.from("trucks").select("id,truck_number").eq("is_active",true).range(offset,offset+999);check(r);trucks.push(...r.data??[]);if((r.data??[]).length<1000)break;}
   let mapped;
   try {mapped=mapResponse(headers,values);} catch(e){
    const saved=await db.from("pretrip_form_submissions").upsert({source_key,sheet_id:String(body.sheet_id),sheet_tab:String(body.sheet_tab??""),source_row:body.source_row,source_timezone:String(body.timezone??"America/Chicago"),driver_name:"Unparsed response",truck_number:"Unknown",answers:Object.fromEntries(headers.map((h:string,i:number)=>[h,String(values[i]??"")])),status:"error",import_error:(e as Error).message},{onConflict:"source_key",ignoreDuplicates:true});check(saved);
    throw e;
   }
   const truck_id=matchTruck(mapped.truck_number,trucks);
   const response_key=await hash(JSON.stringify([body.sheet_id,body.sheet_tab,mapped.submitted_at,mapped.email]));
   if(!existing.data){
    check(await db.from("pretrip_form_submissions").upsert({...mapped,source_key,response_key,truck_id,sheet_id:String(body.sheet_id),sheet_tab:String(body.sheet_tab??""),source_row:body.source_row,source_timezone:String(body.timezone??"America/Chicago"),status:truck_id?(mapped.files.length?"pending":"imported"):"unmatched",import_error:truck_id?null:"No unique active truck matches this truck number"},{onConflict:"source_key",ignoreDuplicates:true}));
    existing=await db.from("pretrip_form_submissions").select("*").eq("source_key",source_key).single();check(existing);
   } else if(!existing.data.truck_id||existing.data.status==="superseded"){
    check(await db.from("pretrip_form_submissions").update({truck_id,status:truck_id?(existing.data.files.every((f:FormFile)=>f.status==="imported")?"imported":"pending"):"unmatched",import_error:truck_id?null:"No unique active truck matches this truck number"}).eq("id",existing.data.id));
    existing.data.truck_id=truck_id;
   }
   if(mapped.submitted_at)check(await db.from("pretrip_form_submissions").update({status:"superseded"}).eq("response_key",response_key).neq("source_key",source_key));
   check(await db.from("pretrip_form_sync").update({last_success_at:new Date().toISOString(),last_finished_at:new Date().toISOString(),last_error:null}).eq("id",true));
   return Response.json({id:existing.data.id,truck_id:existing.data.truck_id,status:existing.data.status,files:existing.data.files});
  }
  const get=(k:string)=>isPhoto?body.get(k):body[k];
  const id=String(get("submission_id")??""),drive_id=String(get("drive_id")??""),category=String(get("category")??"");
  const found=await db.from("pretrip_form_submissions").select("id,truck_id,inspection_date,files,status").eq("id",id).maybeSingle();check(found);
  const submission=found.data;
  const file:FormFile|undefined=submission?.files?.find((f:FormFile)=>f.drive_id===drive_id&&f.category===category);
  if(!submission?.truck_id||!file||submission.status==="superseded")throw new Error("Unknown submission, truck or photo");
  if(!isPhoto){
   check(await db.rpc("update_pretrip_form_file",{_id:id,_drive_id:drive_id,_category:category,_patch:{status:"error",error:String(get("error")??"Google photo unavailable").slice(0,250)}}));
   return Response.json({ok:true});
  }
  const blob=get("file");
  if(!(blob instanceof File)||!blob.type.startsWith("image/")||blob.size>10485760)throw new Error("Photo must be an image no larger than 10 MB");
  const path=`${submission.truck_id}/${submission.inspection_date}/google/${id}/${drive_id}`;
  const old=await db.from("pretrip_photos").select("file_path,file_name").eq("form_submission_id",id).eq("google_file_id",drive_id).eq("photo_category",category).maybeSingle();check(old);
  if(!old.data){
   const upload=await db.storage.from("pretrip-photos").upload(path,blob,{contentType:blob.type,upsert:false});
   if(upload.error&&String((upload.error as {statusCode?:string}).statusCode)!=="409")throw new Error("TMS photo upload failed");
   const saved=await db.from("pretrip_photos").insert({truck_id:submission.truck_id,inspection_date:submission.inspection_date,file_path:path,file_name:blob.name,photo_category:category,google_file_id:drive_id,form_submission_id:id});
   if(saved.error&&saved.error.code!=="23505")throw new Error("TMS photo record failed");
  }
  check(await db.rpc("update_pretrip_form_file",{_id:id,_drive_id:drive_id,_category:category,_patch:{status:"imported",file_path:path,file_name:old.data?.file_name??blob.name,error:null}}));
  return Response.json({ok:true});
 } catch(e){
  const error=(e as Error).message;
  await db.from("pretrip_form_sync").update({last_finished_at:new Date().toISOString(),last_error:error}).eq("id",true);
  return Response.json({error},{status:400});
 }
});
