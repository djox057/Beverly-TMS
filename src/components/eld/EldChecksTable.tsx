import { memo } from 'react';
import { eldComplete, type EldCheck, type EldCheckField, type EldWorker } from '@/lib/eld';
import { OilChangeEditCell } from '@/components/liveOilChange/OilChangeEditCell';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const fields = ['yesterday_log', 'forms', 'pti'] as const;
type RowProps = {
  row: EldCheck; workers: EldWorker[]; editable: boolean; assignable: boolean;
  pendingFields: number; assigning: boolean;
  onSave: (id: string, field: EldCheckField, value: boolean) => void;
  onAssign: (driverId: string, workerId: string | null) => void;
  onSaveNote: (id: string, value: string) => Promise<void>;
};
const EldDriverRow = memo(function EldDriverRow({ row, workers, editable, assignable, pendingFields, assigning, onSave, onAssign, onSaveNote }: RowProps) {
  return <TableRow className="h-11" data-driver-id={row.driver_id}>
    <TableCell className="font-medium"><span className="block truncate" title={row.truck_number}>{row.truck_number || '—'}</span></TableCell>
    <TableCell>{row.members ? <Popover><PopoverTrigger asChild><button type="button" className="font-medium text-primary underline underline-offset-4" aria-label={`Show team names for truck ${row.truck_number}`}>Team</button></PopoverTrigger><PopoverContent><p className="font-medium mb-2">Team · Truck {row.truck_number}</p>{row.members.map(member => <p key={member.id}>{member.driver_name}</p>)}</PopoverContent></Popover> : <span className="block truncate" title={row.driver_name}>{row.driver_name}</span>}{row.inactive_at && <span className="text-xs text-muted-foreground">Done · pending account deletion</span>}</TableCell>
    <TableCell>{assignable && !row.inactive_at ? <Select value={row.worker_id || 'unassigned'} disabled={assigning} onValueChange={value => onAssign(row.driver_id, value === 'unassigned' ? null : value)}>
      <SelectTrigger aria-label={`Assign ELD person for ${row.driver_name}`} className="h-8 w-full min-w-0 [&>span]:truncate" title={row.worker_name || 'Unassigned'}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{row.worker_id && !workers.some(w => w.user_id === row.worker_id) && <SelectItem value={row.worker_id} disabled>{row.worker_name || 'Former ELD worker'}</SelectItem>}{workers.map(worker => <SelectItem key={worker.user_id} value={worker.user_id}>{worker.name}</SelectItem>)}</SelectContent>
    </Select> : <span className={`block truncate ${row.worker_name ? '' : 'text-muted-foreground'}`} title={row.worker_name || 'Unassigned'}>{row.worker_name || 'Unassigned'}</span>}</TableCell>
    {fields.map((field, index) => <TableCell key={field} className="text-center"><Checkbox aria-label={`${field.replace(/_/g, ' ')} for ${row.driver_name}`} aria-busy={!!(pendingFields & (1 << index))} checked={row.members?.some(m => m[field]) && !row[field] ? 'indeterminate' : row[field]} disabled={!editable || !!(pendingFields & (1 << index))} onCheckedChange={value => onSave(row.id, field, value === true)} /></TableCell>)}
    <TableCell><OilChangeEditCell value={row.comment} label={`Note · ${row.driver_name} · ${row.work_date}`} multiline maxLength={5000} readOnly={!editable}
      className="block h-9 min-w-0 truncate whitespace-nowrap px-1 border-0 bg-transparent shadow-none rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted/40 focus:bg-muted/60 transition-colors"
      onSave={async raw => { const note = raw.trim(); if (note !== row.comment) await onSaveNote(row.id, note); }} /></TableCell>
    <TableCell className="text-center"><Checkbox aria-label={`Deleted accounts for ${row.driver_name}`} checked={row.deleted_accounts ?? false}
      disabled={!editable || !row.inactive_at || !!(pendingFields & 8)}
      onCheckedChange={value => onSave(row.id, 'deleted_accounts', value === true)} /></TableCell>
    <TableCell>{eldComplete(row) ? <Badge variant="secondary" className="whitespace-nowrap bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Complete</Badge> : <Badge variant="outline" className="whitespace-nowrap">Incomplete</Badge>}</TableCell>
  </TableRow>;
});

type TableProps = Omit<RowProps, 'row' | 'pendingFields' | 'assigning'> & {
  rows: EldCheck[]; pendingCheckKeys: ReadonlySet<string>; pendingAssignments: ReadonlySet<string>; emptyMessage: string;
};
export const EldChecksTable = memo(function EldChecksTable({ rows, workers, editable, assignable, pendingCheckKeys, pendingAssignments, onSave, onAssign, onSaveNote, emptyMessage }: TableProps) {
  return <div className="rounded-md border overflow-x-auto max-h-[65vh]">
    <Table aria-label="Daily ELD driver checks" className="table-fixed min-w-[1296px] [&_td]:h-11 [&_td]:px-3 [&_td]:py-0 [&_th]:h-10 [&_th]:px-3 [&_th]:whitespace-nowrap">
      <colgroup><col className="w-[76px]" /><col className="w-[184px]" /><col className="w-[184px]" /><col className="w-[112px]" /><col className="w-[72px]" /><col className="w-[64px]" /><col /><col className="w-[144px]" /><col className="w-[112px]" /></colgroup>
      <TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Truck#</TableHead><TableHead>Driver</TableHead><TableHead>ELD person</TableHead><TableHead className="text-center">Yesterday log</TableHead><TableHead className="text-center">Forms</TableHead><TableHead className="text-center">PTI</TableHead><TableHead>Note</TableHead><TableHead className="text-center">Deleted accounts</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(row => <EldDriverRow key={row.id} row={row} workers={workers} editable={editable} assignable={assignable}
        pendingFields={((row.members ?? [row]).some(m => pendingCheckKeys.has(`${m.id}:deleted_accounts`)) ? 8 : 0) | fields.reduce((mask, field, index) => mask | ((row.members ?? [row]).some(m => pendingCheckKeys.has(`${m.id}:${field}`)) ? 1 << index : 0), 0)}
        assigning={(row.members ?? [row]).some(m => pendingAssignments.has(m.driver_id))} onSave={onSave} onAssign={onAssign} onSaveNote={onSaveNote} />)}
        {!rows.length && <TableRow><TableCell colSpan={9}><div className="flex h-28 items-center justify-center text-muted-foreground">{emptyMessage}</div></TableCell></TableRow>}
      </TableBody>
    </Table>
  </div>;
});
