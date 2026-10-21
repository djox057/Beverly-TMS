import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Plus, RefreshCw, Search } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { useEldCompanies } from '@/hooks/useEldCompanies';
import { useEldDay } from '@/hooks/useEld';
import { EldChecksTable } from '@/components/eld/EldChecksTable';
import { EldActivityLog } from '@/components/eld/EldActivityLog';
import { eldComplete, eldToday, filterEldChecks, isEldWeekday, type EldCheck, type EldCheckField } from '@/lib/eld';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const EMPTY_CHECKS: EldCheck[] = [];

export default function Eld() {
  const [today, setToday] = useState(eldToday);
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [worker, setWorker] = useState('all');
  const [status, setStatus] = useState('all');
  const [company, setCompany] = useState('all');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskWorker, setTaskWorker] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const { day, saveCheck, manage, pendingCheckKeys, pendingAssignments, pendingTasks, addingTask, hasPendingWrites } = useEldDay(date);
  // A tab left open overnight follows Chicago midnight, including DST changes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = eldToday();
      if (next !== today) {
        setToday(next);
        setDate(selected => selected === today ? next : selected);
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
  const checks = data?.checks ?? EMPTY_CHECKS;
  const workers = data?.workers ?? [];
  const tasks = data?.tasks ?? [];
  const companyQuery = useEldCompanies(checks);
  const companyData = companyQuery.data;
  const companyFor = (row: EldCheck) => companyData?.trucks.get(row.truck_number) || companyData?.drivers.get(row.driver_id) || null;
  const companyOptions = [...new Set(checks.map(companyFor).filter((id): id is string => !!id))]
    .map(id => ({ id, name: companyData?.names.get(id) || 'Unknown company' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = useMemo(() => filterEldChecks(checks, search, worker, status).filter(row => {
    const id = companyData?.trucks.get(row.truck_number) || companyData?.drivers.get(row.driver_id) || null;
    return company === 'all' || (company === 'none' ? !id : id === company);
  }), [checks, search, worker, status, company, companyData]);
  const completed = rows.filter(eldComplete).length;
  const workerNames = new Map(workers.map(w => [w.user_id, w.name]));
  checks.forEach(c => { if (c.worker_id && c.worker_name && !workerNames.has(c.worker_id)) workerNames.set(c.worker_id, c.worker_name); });
  const selectDate = (next: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next > today) return;
    setDate(next); setTaskOpen(false); setWorker('all');
  };
  const { mutate: changeCheck } = saveCheck;
  const { mutate: changeAssignment } = manage;
  const saveField = useCallback((id: string, field: EldCheckField, value: boolean) => changeCheck({ id, field, value }), [changeCheck]);
  const assignWorker = useCallback((driverId: string, workerId: string | null) => changeAssignment({ action: 'assign', payload: { driver_id: driverId, worker_id: workerId } }), [changeAssignment]);
  const { mutateAsync: changeNote } = saveCheck;
  const saveNote = useCallback(async (id: string, value: string) => { await changeNote({ id, field: 'comment', value }); }, [changeNote]);
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
        <Button variant="outline" size="icon" aria-label="Refresh ELD" disabled={day.isFetching || hasPendingWrites} onClick={() => day.refetch()}><RefreshCw className={`h-4 w-4 ${day.isFetching ? 'animate-spin' : ''}`} /></Button>
      </div>
    </div>
    {day.isPending && <p className="p-8 text-center text-muted-foreground">Loading ELD work…</p>}
    {day.error && <div role="alert" className="rounded-md border border-destructive p-4 text-destructive">Unable to load ELD work: {day.error.message}<Button variant="outline" className="ml-3" onClick={() => day.refetch()}>Retry</Button></div>}
    {data && <>
      {!data.can_manage && !data.can_work && <p className="rounded-md border p-4 text-muted-foreground">No ELD work is assigned to this account. An admin can enable the ELD tag in Users.</p>}
      {!weekday && <p className="rounded-md border p-4 text-muted-foreground">No daily checklist is required on weekends. Select a weekday to view its history.</p>}
      {!current && <p className="text-sm text-muted-foreground">Viewing saved history for {date}.{manager ? ' Manager changes are recorded in Activity.' : ' History is read-only.'}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Drivers', rows.length], ['Completed', completed], ['Incomplete', rows.length - completed], ['Unassigned', rows.filter(c => !c.worker_id).length]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></CardContent></Card>)}
      </div>
      <Tabs defaultValue="checks" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="checks">Daily checks</TabsTrigger><TabsTrigger value="tasks">Side tasks ({tasks.length})</TabsTrigger>{manager && <TabsTrigger value="team">Team overview</TabsTrigger>}<TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
        <TabsContent value="checks" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-52 max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search drivers, trucks or ELD person" placeholder="Search truck, driver or ELD person…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            {manager && <Select value={worker} onValueChange={setWorker}><SelectTrigger className="w-52" aria-label="Filter ELD person"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All ELD people</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{[...workerNames].map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>}
            <Select value={company} onValueChange={setCompany} disabled={companyQuery.isPending || companyQuery.isError}><SelectTrigger className="w-56" aria-label="Filter company"><SelectValue placeholder="Company" /></SelectTrigger><SelectContent><SelectItem value="all">All companies</SelectItem><SelectItem value="none">No company</SelectItem>{companyOptions.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select>
            {companyQuery.isError && <span role="alert" className="text-sm text-destructive">Could not load companies. <Button variant="link" onClick={() => companyQuery.refetch()}>Retry</Button></span>}
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44" aria-label="Filter completion"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All checks</SelectItem><SelectItem value="incomplete">Incomplete</SelectItem><SelectItem value="complete">Completed</SelectItem></SelectContent></Select>
            <span className="text-sm text-muted-foreground ml-auto">{rows.length} drivers</span>
          </div>
          <EldChecksTable rows={rows} workers={workers} editable={editable} assignable={manager && current}
            pendingCheckKeys={pendingCheckKeys} pendingAssignments={pendingAssignments}
            onSave={saveField} onAssign={assignWorker} onSaveNote={saveNote}
            emptyMessage={!weekday ? 'No weekend checklist.' : !checks.length ? manager ? 'No saved driver checks for this date.' : 'No drivers assigned to you for this date.' : 'No drivers match these filters.'} />
        </TabsContent>
        <TabsContent value="tasks" className="space-y-3">
          <div className="flex justify-between items-center gap-3"><p className="text-sm text-muted-foreground">Additional tasks assigned for this date. Tasks stay in this day’s history.</p>{manager && current && weekday && <Button onClick={() => setTaskOpen(true)}><Plus className="mr-2 h-4 w-4" />Add side task</Button>}</div>
          <div className="rounded-md border overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Done</TableHead><TableHead>Task</TableHead><TableHead>ELD person</TableHead><TableHead>Completed at (Chicago)</TableHead></TableRow></TableHeader><TableBody>{tasks.map(task => <TableRow key={task.id}><TableCell><Checkbox aria-label={`Complete ${task.description}`} checked={task.completed} disabled={!editable || pendingTasks.has(task.id)} onCheckedChange={value => manage.mutate({ action: 'complete_task', payload: { id: task.id, completed: value === true } })} /></TableCell><TableCell className="min-w-64 whitespace-pre-wrap break-words">{task.description}</TableCell><TableCell>{workerNames.get(task.worker_id) || 'Former ELD worker'}</TableCell><TableCell className="whitespace-nowrap">{task.completed_at ? formatInTimeZone(task.completed_at, 'America/Chicago', 'MM/dd/yyyy HH:mm') : '—'}</TableCell></TableRow>)}{!tasks.length && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No side tasks for this date.</TableCell></TableRow>}</TableBody></Table></div>
        </TabsContent>
        {manager && <TabsContent value="team"><div className="rounded-md border overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ELD person</TableHead><TableHead>Drivers</TableHead><TableHead>Yesterday log</TableHead><TableHead>Forms</TableHead><TableHead>PTI</TableHead><TableHead>Fully checked</TableHead><TableHead>Side tasks done</TableHead></TableRow></TableHeader><TableBody>{[...workerNames].map(([id, name]) => {
          const assigned = checks.filter(c => c.worker_id === id); const assignedTasks = tasks.filter(t => t.worker_id === id);
          return <TableRow key={id}><TableCell>{name}</TableCell><TableCell>{assigned.length}</TableCell>{(['yesterday_log', 'forms', 'pti'] as const).map(field => <TableCell key={field}>{assigned.filter(c => c[field]).length} / {assigned.length}</TableCell>)}<TableCell>{assigned.filter(eldComplete).length} / {assigned.length}</TableCell><TableCell>{assignedTasks.filter(t => t.completed).length} / {assignedTasks.length}</TableCell></TableRow>;
        })}{!workerNames.size && <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Enable ELD tags in Users to assign work.</TableCell></TableRow>}</TableBody></Table></div></TabsContent>}
        <TabsContent value="activity"><EldActivityLog key={date} date={date} workers={workers} /></TabsContent>
      </Tabs>
    </>}

    <Dialog open={taskOpen} onOpenChange={open => { if (!addingTask) setTaskOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Add side task</DialogTitle><DialogDescription>Assign additional work for {date}.</DialogDescription></DialogHeader><Label>ELD person</Label><Select value={taskWorker} onValueChange={setTaskWorker}><SelectTrigger aria-label="Side task ELD person"><SelectValue placeholder="Select ELD person" /></SelectTrigger><SelectContent>{workers.map(w => <SelectItem key={w.user_id} value={w.user_id}>{w.name}</SelectItem>)}</SelectContent></Select><Label htmlFor="eld-task-description">Task</Label><Textarea id="eld-task-description" rows={4} maxLength={2000} value={taskDescription} onChange={e => setTaskDescription(e.target.value)} /><DialogFooter><Button variant="outline" disabled={addingTask} onClick={() => setTaskOpen(false)}>Cancel</Button><Button disabled={!taskWorker || !taskDescription.trim() || addingTask} onClick={addTask}>{addingTask ? 'Adding…' : 'Add task'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
