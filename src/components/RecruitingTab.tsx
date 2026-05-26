import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Minus, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DayInput } from "@/components/DayInput";

type MonthOption = { value: string; label: string };

type Recruiter = {
  user_id: string;
  full_name: string;
};

type PaymentRow = {
  id?: string;
  user_id: string;
  month: string;
  base_salary: number;
  extra_days: number;
  lost_days: number;
  with_card_days: number;
  without_card_days: number;
  food_allowance: number;
  recruiter_name?: string | null;
  extra_day_dates: string[];
  lost_day_dates: string[];
};

const WITH_CARD_RATE = 65;
const WITHOUT_CARD_RATE = 130;
const FOOD_ALLOWANCE = 70;

const isWeekday = (d: Date) => {
  const day = d.getDay();
  return day !== 0 && day !== 6;
};

const getWorkDaysInMonth = (year: number, monthIndex: number) => {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let i = 1; i <= days; i++) if (isWeekday(new Date(year, monthIndex, i))) count++;
  return count;
};

const blankRow = (user_id: string, month: string, name: string): PaymentRow => ({
  user_id,
  month,
  base_salary: 0,
  extra_days: 0,
  lost_days: 0,
  with_card_days: 0,
  without_card_days: 0,
  food_allowance: FOOD_ALLOWANCE,
  recruiter_name: name,
  extra_day_dates: [],
  lost_day_dates: [],
});

export default function RecruitingTab({ monthOptions }: { monthOptions: MonthOption[] }) {
  const queryClient = useQueryClient();
  const defaultMonth = monthOptions[0]?.value ?? "all";
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);

  // Fetch recruiters (users with role 'recruiting')
  const { data: recruiters = [] } = useQuery<Recruiter[]>({
    queryKey: ["recruiting-users"],
    queryFn: async () => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "recruiting" as any);
      if (roleErr) throw roleErr;
      const ids = (roleRows ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      if (profErr) throw profErr;
      return (profs ?? [])
        .map((p: any) => ({ user_id: p.user_id, full_name: p.full_name || p.email || "Unknown" }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  // Fetch payments for selected month
  const { data: paymentsData } = useQuery({
    queryKey: ["recruiter-salary-payments", selectedMonth],
    queryFn: async () => {
      if (!selectedMonth || selectedMonth === "all") return {} as Record<string, PaymentRow>;
      const { data, error } = await supabase
        .from("recruiter_salary_payments" as any)
        .select("*")
        .eq("month", selectedMonth);
      if (error) throw error;
      const map: Record<string, PaymentRow> = {};
      (data ?? []).forEach((row: any) => {
        map[row.user_id] = {
          ...row,
          extra_day_dates: row.extra_day_dates ?? [],
          lost_day_dates: row.lost_day_dates ?? [],
        } as PaymentRow;
      });
      return map;
    },
    enabled: !!selectedMonth && selectedMonth !== "all",
  });

  const [rows, setRows] = useState<Record<string, PaymentRow>>({});
  const rowsRef = useRef<Record<string, PaymentRow>>({});
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSavedAt = useRef<Record<string, number>>({});

  const isDirty = (userId: string) =>
    !!saveTimers.current[userId] || Date.now() - (lastSavedAt.current[userId] ?? 0) < 1500;

  useEffect(() => {
    if (!recruiters.length || !selectedMonth || selectedMonth === "all") {
      setRows({});
      return;
    }
    // Merge server data into local rows. Skip users with in-flight edits so
    // typing or recent saves never get clobbered by realtime refetches.
    setRows((prev) => {
      const next: Record<string, PaymentRow> = {};
      recruiters.forEach((r) => {
        const local = prev[r.user_id];
        if (local && isDirty(r.user_id)) {
          next[r.user_id] = { ...local, recruiter_name: r.full_name };
          return;
        }
        const server = paymentsData?.[r.user_id];
        if (server) {
          next[r.user_id] = {
            ...server,
            recruiter_name: r.full_name,
            extra_day_dates: server.extra_day_dates ?? [],
            lost_day_dates: server.lost_day_dates ?? [],
            extra_days: (server.extra_day_dates ?? []).length,
            lost_days: (server.lost_day_dates ?? []).length,
          };
        } else if (local) {
          next[r.user_id] = { ...local, recruiter_name: r.full_name };
        } else {
          next[r.user_id] = blankRow(r.user_id, selectedMonth, r.full_name);
        }
      });
      rowsRef.current = next;
      return next;
    });
  }, [recruiters, paymentsData, selectedMonth]);

  // Realtime: refresh server data when anyone updates recruiter salaries.
  useEffect(() => {
    if (!selectedMonth || selectedMonth === "all") return;
    const channel = supabase
      .channel(`recruiter-salaries-${selectedMonth}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recruiter_salary_payments",
          filter: `month=eq.${selectedMonth}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recruiter-salary-payments", selectedMonth] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedMonth, queryClient]);

  const workDaysInMonth = useMemo(() => {
    if (!selectedMonth || selectedMonth === "all") return 22;
    const [y, m] = selectedMonth.split("-").map(Number);
    if (!y || !m) return 22;
    return getWorkDaysInMonth(y, m - 1);
  }, [selectedMonth]);

  const computeSalary = (r: PaymentRow) => {
    const perDay = workDaysInMonth > 0 ? r.base_salary / workDaysInMonth : 0;
    return (
      r.base_salary +
      r.extra_days * perDay -
      r.lost_days * perDay +
      r.with_card_days * WITH_CARD_RATE +
      r.without_card_days * WITHOUT_CARD_RATE +
      r.food_allowance
    );
  };

  const saveRow = async (row: PaymentRow) => {
    const payload = {
      user_id: row.user_id,
      month: row.month,
      base_salary: row.base_salary,
      extra_days: row.extra_day_dates.length,
      lost_days: row.lost_day_dates.length,
      with_card_days: row.with_card_days,
      without_card_days: row.without_card_days,
      food_allowance: row.food_allowance,
      extra_day_dates: row.extra_day_dates,
      lost_day_dates: row.lost_day_dates,
      recruiter_name: row.recruiter_name ?? null,
    };
    const { error } = await supabase
      .from("recruiter_salary_payments" as any)
      .upsert(payload, { onConflict: "user_id,month" });
    if (error) {
      toast.error("Failed to save: " + error.message);
      return false;
    }
    return true;
  };

  const scheduleSave = (userId: string, delay = 200) => {
    const existing = saveTimers.current[userId];
    if (existing) clearTimeout(existing);
    saveTimers.current[userId] = setTimeout(async () => {
      delete saveTimers.current[userId];
      const latest = rowsRef.current[userId];
      if (latest) {
        const ok = await saveRow(latest);
        if (ok) lastSavedAt.current[userId] = Date.now();
      }
    }, delay);
  };

  const updateField = (userId: string, patch: Partial<PaymentRow>, delay = 200) => {
    setRows((prev) => {
      const cur = prev[userId];
      if (!cur) return prev;
      const updated = { ...cur, ...patch };
      const next = { ...prev, [userId]: updated };
      rowsRef.current = next;
      return next;
    });
    scheduleSave(userId, delay);
  };

  const addDayDate = (userId: string, field: "extra_day_dates" | "lost_day_dates", date: string) => {
    const current = rowsRef.current[userId];
    if (!current) return;
    if (current[field].includes(date)) {
      toast.error("Date already added");
      return;
    }
    const next = [...current[field], date].sort();
    const counterField = field === "extra_day_dates" ? "extra_days" : "lost_days";
    updateField(userId, { [field]: next, [counterField]: next.length } as any, 0);
  };

  const removeDayDate = (userId: string, field: "extra_day_dates" | "lost_day_dates", date: string) => {
    const current = rowsRef.current[userId];
    if (!current) return;
    const next = current[field].filter((d) => d !== date);
    const counterField = field === "extra_day_dates" ? "extra_days" : "lost_days";
    updateField(userId, { [field]: next, [counterField]: next.length } as any, 0);
  };

  const monthDisabled = !selectedMonth || selectedMonth === "all";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle>Recruiting</CardTitle>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {monthDisabled ? (
          <p className="text-sm text-muted-foreground">Select a month to view recruiter salaries.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recruiter</TableHead>
                  <TableHead className="text-right w-[140px]">Base Salary</TableHead>
                  <TableHead className="text-right w-[100px]">Extra Days</TableHead>
                  <TableHead className="text-right w-[100px]">Lost Days</TableHead>
                  <TableHead className="text-right w-[110px]">With Card</TableHead>
                  <TableHead className="text-right w-[120px]">Without Card</TableHead>
                  <TableHead className="text-right w-[90px]">Food</TableHead>
                  <TableHead className="text-right w-[120px]">Salary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recruiters.map((r) => {
                  const row = rows[r.user_id];
                  if (!row) return null;
                  const salary = computeSalary(row);
                  return (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          className="h-8 text-right border-0 bg-transparent shadow-none focus-visible:ring-1 px-1"
                          value={row.base_salary === 0 ? "" : String(row.base_salary)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d.]/g, "");
                            const num = raw === "" ? 0 : Number(raw) || 0;
                            updateField(r.user_id, { base_salary: num });
                          }}
                        />
                      </TableCell>
                      <DatesCell
                        label="Extra Days"
                        accent="text-green-600"
                        sign="+"
                        dates={row.extra_day_dates}
                        onAdd={(d) => addDayDate(r.user_id, "extra_day_dates", d)}
                        onRemove={(d) => removeDayDate(r.user_id, "extra_day_dates", d)}
                      />
                      <DatesCell
                        label="Days Off"
                        accent="text-red-600"
                        sign="-"
                        dates={row.lost_day_dates}
                        onAdd={(d) => addDayDate(r.user_id, "lost_day_dates", d)}
                        onRemove={(d) => removeDayDate(r.user_id, "lost_day_dates", d)}
                      />
                      <CounterCell
                        value={row.with_card_days}
                        onChange={(v) => updateField(r.user_id, { with_card_days: v })}
                        suffix={`×$${WITH_CARD_RATE}`}
                      />
                      <CounterCell
                        value={row.without_card_days}
                        onChange={(v) => updateField(r.user_id, { without_card_days: v })}
                        suffix={`×$${WITHOUT_CARD_RATE}`}
                      />
                      <TableCell className="text-right">${row.food_allowance}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ${salary.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recruiters.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No recruiters found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CounterCell({
  value,
  onChange,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <TableCell className="text-right">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8">
            {value}
            {suffix && <span className="ml-1 text-xs text-muted-foreground">{suffix}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="end">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => onChange(Math.max(0, value - 1))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-8 text-center font-medium">{value}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => onChange(value + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </TableCell>
  );
}

function DatesCell({
  label,
  accent,
  sign,
  dates,
  onAdd,
  onRemove,
}: {
  label: string;
  accent: string;
  sign: "+" | "-";
  dates: string[];
  onAdd: (d: string) => void;
  onRemove: (d: string) => void;
}) {
  const count = dates.length;
  return (
    <TableCell className={`text-right ${accent}`}>
      <Popover>
        <PopoverTrigger asChild>
          <button className="cursor-pointer hover:underline font-medium">
            {count > 0 ? `${sign}${count}` : 0}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="end">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {dates.length === 0 && (
              <p className="text-xs text-muted-foreground">No dates</p>
            )}
            {dates.map((d) => {
              const [y, m, day] = d.split("-").map(Number);
              return (
                <div key={d} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{`${m}/${day}`}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(d)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            <div className="border-t pt-2 mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Add date</p>
              <Input
                type="date"
                className="h-7 text-xs"
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  onAdd(val);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TableCell>
  );
}