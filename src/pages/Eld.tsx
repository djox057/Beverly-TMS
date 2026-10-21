import { useEffect, useState } from 'react';
import { ClipboardCheck, MessageSquare, Plus, RefreshCw, Search } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { useEldDay } from '@/hooks/useEld';
import { EldActivityLog } from '@/components/eld/EldActivityLog';
import { eldComplete, eldToday, filterEldChecks, isEldWeekday, type EldCheck } from '@/lib/eld';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function Eld() {
  const [today, setToday] = useState(eldToday);
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [worker, setWorker] = useState('all');
  const [status, setStatus] = useState('all');
  const [commentRow, setCommentRow] = useState<EldCheck | null>(null);
  const [comment, setComment] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskWorker, setTaskWorker] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const { day, saveCheck, manage } = useEldDay(date);
  // A tab left open overnight follows Chicago midnight, including DST changes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = eldToday();
      if (next !== today) {
        setToday(next);
        setDate(selected => selected === today ? next : selected);
        setCommentRow(null);
        setTaskOpen(false);
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [today]);
  const data = day.data;
  const manager = !!data?.can_manage;
  const weekday = isEldWeekday(date);
  const editable = weekday && (manager || (date === data?.today && !!data?.can_work));
  const current = date === data?.today;
  const busy = saveCheck.isPending || manage.isPending;
  const checks = data?.checks ?? [];
  const workers = data?.workers ?? [];
  const tasks = data?.tasks ?? [];
  const rows = filterEldChecks(checks, search, worker, status);
  const completed = checks.filter(eldComplete).length;
  const workerNames = new Map(workers.map(w => [w.user_id, w.name]));
  checks.forEach(c => { if (c.worker_id && c.worker_name && !workerNames.has(c.worker_id)) workerNames.set(c.worker_id, c.worker_name); });
  const selectDate = (next: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next > today) return;
    setDate(next); setCommentRow(null); setTaskOpen(false); setWorker('all');
  };
  const openComment = (row: EldCheck) => { setCommentRow(row); setComment(row.comment); };
  const saveComment = async () => {
    if (!commentRow) return;
    try { await saveCheck.mutateAsync({ id: commentRow.id, field: 'comment', value: comment }); setCommentRow(null); } catch { /* Mutation displays the error and retains the draft. */ }
  };
  const addTask = async () => {
    try {
      await manage.mutateAsync({ action: 'add_task', payload: { work_date: date, worker_id: taskWorker, description: taskDescription.trim() } });
      setTaskOpen(false); setTaskDescription(''); setTaskWorker('');
    } catch { /* Keep the draft on failure. */ }
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20 bg-background py-3 border-b">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6" />ELD</h1><p className="text-sm text-muted-foreground">Daily driver checks · Chicago time · Monday–Friday</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="eld-work-date">Date / history</Label>
        <Input id="eld-work-date" type="date" className="w-40" value={date} max={today} onChange={event => selectDate(event.target.value)} />
        <Button variant="outline" onClick={() => selectDate(today)} disabled={date === today}>Today</Button>
        <Button variant="outline" size="icon" aria-label="Refresh ELD" disabled={day.isFetching || busy} onClick={() => day.refetch()}><RefreshCw className={`h-4 w-4 ${day.isFetching ? 'animate-spin' : ''}`} /></Button>
      </div>
    </div>
    {day.isPending && <p className="p-8 text-center text-muted-foreground">Loading ELD work…</p>}
    {day.error && <div role="alert" className="rounded-md border border-destructive p-4 text-destructive">Unable to load ELD work: {day.error.message}<Button variant="outline" className="ml-3" onClick={() => day.refetch()}>Retry</Button></div>}
    {data && <>
      {!data.can_manage && !data.can_work && <p className="rounded-md border p-4 text-muted-foreground">No ELD work is assigned to this account. An admin can enable the ELD tag in Users.</p>}
      {!weekday && <p className="rounded-md border p-4 text-muted-foreground">No daily checklist is required on weekends. Select a weekday to view its history.</p>}
      {!current && <p className="text-sm text-muted-foreground">Viewing saved history for {date}.{manager ? ' Manager changes are recorded in Activity.' : ' History is read-only.'}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Drivers', checks.length], ['Completed', completed], ['Incomplete', checks.length - completed], ['Unassigned', checks.filter(c => !c.worker_id).length]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></CardContent></Card>)}
      </div>
      <Tabs defaultValue="checks" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="checks">Daily checks</TabsTrigger><TabsTrigger value="tasks">Side tasks ({tasks.length})</TabsTrigger>{manager && <TabsTrigger value="team">Team overview</TabsTrigger>}<TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
        <TabsContent value="checks" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-52 max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search drivers, trucks or ELD person" placeholder="Search truck, driver or ELD person…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            {manager && <Select value={worker} onValueChange={setWorker}><SelectTrigger className="w-52" aria-label="Filter ELD person"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All ELD people</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{[...workerNames].map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>}
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44" aria-label="Filter completion"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All checks</SelectItem><SelectItem value="incomplete">Incomplete</SelectItem><SelectItem value="complete">Completed</SelectItem></SelectContent></Select>
            <span className="text-sm text-muted-foreground ml-auto">{rows.length} drivers</span>
          </div>
          <div className="rounded-md border overflow-x-auto max-h-[65vh]"><Table className="min-w-[900px]">
            <TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Truck#</TableHead><TableHead>Driver</TableHead><TableHead>ELD person</TableHead><TableHead className="text-center">Yesterday log</TableHead><TableHead className="text-center">Forms</TableHead><TableHead className="text-center">PTI</TableHead><TableHead>Comment</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map(row => <TableRow key={row.id}>
              <TableCell className="font-medium whitespace-nowrap">{row.truck_number || '—'}</TableCell>
              <TableCell className="min-w-44">{row.driver_name}</TableCell>
              <TableCell className="min-w-48">{manager && current ? <Select value={row.worker_id || 'unassigned'} disabled={busy} onValueChange={value => manage.mutate({ action: 'assign', payload: { driver_id: row.driver_id, worker_id: value === 'unassigned' ? null : value } })}>
                <SelectTrigger aria-label={`Assign ELD person for ${row.driver_name}`} className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{row.worker_id && !workers.some(w => w.user_id === row.worker_id) && <SelectItem value={row.worker_id} disabled>{row.worker_name || 'Former ELD worker'}</SelectItem>}{workers.map(w => <SelectItem key={w.user_id} value={w.user_id}>{w.name}</SelectItem>)}</SelectContent>
              </Select> : row.worker_name || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
              {(['yesterday_log', 'forms', 'pti'] as const).map(field => <TableCell key={field} className="text-center"><Checkbox aria-label={`${field.replace(/_/g, ' ')} for ${row.driver_name}`} checked={row[field]} disabled={!editable || busy} onCheckedChange={value => saveCheck.mutate({ id: row.id, field, value: value === true })} /></TableCell>)}
              <TableCell><Button variant="ghost" className="h-auto min-h-8 w-full max-w-64 justify-start gap-2 px-2 text-left font-normal" onClick={() => openComment(row)}><MessageSquare className="h-4 w-4 shrink-0" /><span className="truncate">{row.comment || (editable ? 'Add comment' : '—')}</span></Button></TableCell>
              <TableCell>{eldComplete(row) ? <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Complete</Badge> : <Badge variant="outline">Incomplete</Badge>}</TableCell>
            </TableRow>)}{!rows.length && <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">{!weekday ? 'No weekend checklist.' : !checks.length ? manager ? 'No saved driver checks for this date.' : 'No drivers assigned to you for this date.' : 'No drivers match these filters.'}</TableCell></TableRow>}</TableBody>
          </Table></div>
        </TabsContent>
        <TabsContent value="tasks" className="space-y-3">
          <div className="flex justify-between items-center gap-3"><p className="text-sm text-muted-foreground">Additional tasks assigned for this date. Tasks stay in this day’s history.</p>{manager && current && weekday && <Button onClick={() => setTaskOpen(true)}><Plus className="mr-2 h-4 w-4" />Add side task</Button>}</div>
          <div className="rounded-md border overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Done</TableHead><TableHead>Task</TableHead><TableHead>ELD person</TableHead><TableHead>Completed at (Chicago)</TableHead></TableRow></TableHeader><TableBody>{tasks.map(task => <TableRow key={task.id}><TableCell><Checkbox aria-label={`Complete ${task.description}`} checked={task.completed} disabled={!editable || busy} onCheckedChange={value => manage.mutate({ action: 'complete_task', payload: { id: task.id, completed: value === true } })} /></TableCell><TableCell className="min-w-64 whitespace-pre-wrap break-words">{task.description}</TableCell><TableCell>{workerNames.get(task.worker_id) || 'Former ELD worker'}</TableCell><TableCell className="whitespace-nowrap">{task.completed_at ? formatInTimeZone(task.completed_at, 'America/Chicago', 'MM/dd/yyyy HH:mm') : '—'}</TableCell></TableRow>)}{!tasks.length && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No side tasks for this date.</TableCell></TableRow>}</TableBody></Table></div>
        </TabsContent>
        {manager && <TabsContent value="team"><div className="rounded-md border overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ELD person</TableHead><TableHead>Drivers</TableHead><TableHead>Yesterday log</TableHead><TableHead>Forms</TableHead><TableHead>PTI</TableHead><TableHead>Fully checked</TableHead><TableHead>Side tasks done</TableHead></TableRow></TableHeader><TableBody>{[...workerNames].map(([id, name]) => {
          const assigned = checks.filter(c => c.worker_id === id); const assignedTasks = tasks.filter(t => t.worker_id === id);
          return <TableRow key={id}><TableCell>{name}</TableCell><TableCell>{assigned.length}</TableCell>{(['yesterday_log', 'forms', 'pti'] as const).map(field => <TableCell key={field}>{assigned.filter(c => c[field]).length} / {assigned.length}</TableCell>)}<TableCell>{assigned.filter(eldComplete).length} / {assigned.length}</TableCell><TableCell>{assignedTasks.filter(t => t.completed).length} / {assignedTasks.length}</TableCell></TableRow>;
        })}{!workerNames.size && <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Enable ELD tags in Users to assign work.</TableCell></TableRow>}</TableBody></Table></div></TabsContent>}
        <TabsContent value="activity"><EldActivityLog key={date} date={date} workers={workers} /></TabsContent>
      </Tabs>
    </>}
    <Dialog open={!!commentRow} onOpenChange={open => { if (!open && !saveCheck.isPending) setCommentRow(null); }}><DialogContent><DialogHeader><DialogTitle>Comment · {commentRow?.driver_name}</DialogTitle><DialogDescription>{date} · Truck {commentRow?.truck_number || '—'}</DialogDescription></DialogHeader><Textarea aria-label="Driver ELD comment" rows={6} maxLength={5000} value={comment} readOnly={!editable} onChange={e => setComment(e.target.value)} /><DialogFooter><Button variant="outline" disabled={saveCheck.isPending} onClick={() => setCommentRow(null)}>Close</Button>{editable && <Button disabled={busy || comment === commentRow?.comment} onClick={saveComment}>{saveCheck.isPending ? 'Saving…' : 'Save comment'}</Button>}</DialogFooter></DialogContent></Dialog>
    <Dialog open={taskOpen} onOpenChange={open => { if (!manage.isPending) setTaskOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Add side task</DialogTitle><DialogDescription>Assign additional work for {date}.</DialogDescription></DialogHeader><Label>ELD person</Label><Select value={taskWorker} onValueChange={setTaskWorker}><SelectTrigger aria-label="Side task ELD person"><SelectValue placeholder="Select ELD person" /></SelectTrigger><SelectContent>{workers.map(w => <SelectItem key={w.user_id} value={w.user_id}>{w.name}</SelectItem>)}</SelectContent></Select><Label htmlFor="eld-task-description">Task</Label><Textarea id="eld-task-description" rows={4} maxLength={2000} value={taskDescription} onChange={e => setTaskDescription(e.target.value)} /><DialogFooter><Button variant="outline" disabled={manage.isPending} onClick={() => setTaskOpen(false)}>Cancel</Button><Button disabled={!taskWorker || !taskDescription.trim() || busy} onClick={addTask}>{manage.isPending ? 'Adding…' : 'Add task'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
