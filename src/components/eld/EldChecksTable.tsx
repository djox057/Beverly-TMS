import { memo } from 'react';
import { MessageSquare } from 'lucide-react';
import { eldComplete, type EldCheck, type EldCheckField, type EldWorker } from '@/lib/eld';
import { Button } from '@/components/ui/button';
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
  onComment: (row: EldCheck) => void;
};
const EldDriverRow = memo(function EldDriverRow({ row, workers, editable, assignable, pendingFields, assigning, onSave, onAssign, onComment }: RowProps) {
  return <TableRow className="h-11" data-driver-id={row.driver_id}>
    <TableCell className="font-medium"><span className="block truncate" title={row.truck_number}>{row.truck_number || '—'}</span></TableCell>
    <TableCell><span className="block truncate" title={row.driver_name}>{row.driver_name}</span></TableCell>
    <TableCell>{assignable ? <Select value={row.worker_id || 'unassigned'} disabled={assigning} onValueChange={value => onAssign(row.driver_id, value === 'unassigned' ? null : value)}>
      <SelectTrigger aria-label={`Assign ELD person for ${row.driver_name}`} className="h-8 w-full min-w-0 [&>span]:truncate" title={row.worker_name || 'Unassigned'}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{row.worker_id && !workers.some(w => w.user_id === row.worker_id) && <SelectItem value={row.worker_id} disabled>{row.worker_name || 'Former ELD worker'}</SelectItem>}{workers.map(worker => <SelectItem key={worker.user_id} value={worker.user_id}>{worker.name}</SelectItem>)}</SelectContent>
    </Select> : <span className={`block truncate ${row.worker_name ? '' : 'text-muted-foreground'}`} title={row.worker_name || 'Unassigned'}>{row.worker_name || 'Unassigned'}</span>}</TableCell>
    {fields.map((field, index) => <TableCell key={field} className="text-center"><Checkbox aria-label={`${field.replace(/_/g, ' ')} for ${row.driver_name}`} aria-busy={!!(pendingFields & (1 << index))} checked={row[field]} disabled={!editable || !!(pendingFields & (1 << index))} onCheckedChange={value => onSave(row.id, field, value === true)} /></TableCell>)}
    <TableCell><Button variant="ghost" className="h-9 w-full min-w-0 justify-start gap-2 px-2 text-left font-normal" onClick={() => onComment(row)} title={row.comment || undefined}><MessageSquare className="h-4 w-4 shrink-0" /><span className="block truncate whitespace-nowrap">{row.comment || (editable ? 'Add comment' : '—')}</span></Button></TableCell>
    <TableCell>{eldComplete(row) ? <Badge variant="secondary" className="whitespace-nowrap bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Complete</Badge> : <Badge variant="outline" className="whitespace-nowrap">Incomplete</Badge>}</TableCell>
  </TableRow>;
});

type TableProps = Omit<RowProps, 'row' | 'pendingFields' | 'assigning'> & {
  rows: EldCheck[]; pendingCheckKeys: ReadonlySet<string>; pendingAssignments: ReadonlySet<string>; emptyMessage: string;
};
export const EldChecksTable = memo(function EldChecksTable({ rows, workers, editable, assignable, pendingCheckKeys, pendingAssignments, onSave, onAssign, onComment, emptyMessage }: TableProps) {
  return <div className="rounded-md border overflow-x-auto max-h-[65vh]">
    <Table aria-label="Daily ELD driver checks" className="table-fixed min-w-[1152px] [&_td]:h-11 [&_td]:px-3 [&_td]:py-0 [&_th]:h-10 [&_th]:px-3 [&_th]:whitespace-nowrap">
      <colgroup><col className="w-[76px]" /><col className="w-[152px]" /><col className="w-[152px]" /><col className="w-[112px]" /><col className="w-[72px]" /><col className="w-[64px]" /><col /><col className="w-[112px]" /></colgroup>
      <TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Truck#</TableHead><TableHead>Driver</TableHead><TableHead>ELD person</TableHead><TableHead className="text-center">Yesterday log</TableHead><TableHead className="text-center">Forms</TableHead><TableHead className="text-center">PTI</TableHead><TableHead>Comment</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(row => <EldDriverRow key={row.id} row={row} workers={workers} editable={editable} assignable={assignable}
        pendingFields={fields.reduce((mask, field, index) => mask | (pendingCheckKeys.has(`${row.id}:${field}`) ? 1 << index : 0), 0)}
        assigning={pendingAssignments.has(row.driver_id)} onSave={onSave} onAssign={onAssign} onComment={onComment} />)}
        {!rows.length && <TableRow><TableCell colSpan={8}><div className="flex h-28 items-center justify-center text-muted-foreground">{emptyMessage}</div></TableCell></TableRow>}
      </TableBody>
    </Table>
  </div>;
});
