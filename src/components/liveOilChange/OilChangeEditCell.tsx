import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export function OilChangeEditCell({value,label,onSave,readOnly=false,multiline=false,type='text',placeholder='—',className,maxLength}:{
  value:string|number|null;label:string;onSave:(value:string)=>void|Promise<void>;readOnly?:boolean;multiline?:boolean;type?:'text'|'number';placeholder?:string;className?:string;maxLength?:number;
}) {
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const display=value==null||value===''?placeholder:String(value);
  if(readOnly) return <span className={className} title={display}>{display}</span>;
  const save=async()=>{
    setSaving(true);setError('');
    try {await onSave(draft);setOpen(false);} catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.');} finally{setSaving(false);}
  };
  return <>
    <button type="button" className={`w-full min-h-9 truncate text-left ${className||''}`} aria-label={`Edit ${label}`} title={display} onClick={()=>{setDraft(value==null?'':String(value));setError('');setOpen(true);}}>{display}</button>
    <Dialog open={open} onOpenChange={next=>{if(!saving)setOpen(next);}}><DialogContent className="w-[calc(100%_-_2rem)] max-h-[85dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
      <form onSubmit={event=>{event.preventDefault();void save();}} className="space-y-4">
        {multiline?<Textarea autoFocus maxLength={maxLength} aria-label={label} value={draft} onChange={e=>setDraft(e.target.value)} className="min-h-40 text-base" disabled={saving}/>:<Input autoFocus aria-label={label} type={type} inputMode={type==='number'?'numeric':undefined} value={draft} onChange={e=>setDraft(e.target.value)} className="text-base" disabled={saving}/>}
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving?'Saving…':'Save'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </>;
}
