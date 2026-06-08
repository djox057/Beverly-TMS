import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Minus, Plus, Send, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { DayInput } from "@/components/DayInput";
import RecruiterStatementPreviewDialog from "@/components/RecruiterStatementPreviewDialog";
import type { PayrollAdjustment } from "@/utils/payrollPdfGenerator";
import { Trash2 } from "lucide-react";

type MonthOption = { value: string; label: string };

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "recruiting", label: "Recruiting" },
  { value: "accounting", label: "Accounting" },
  { value: "maintenance", label: "Maintenance" },
  { value: "claims", label: "Claims" },
  { value: "safety", label: "Safety" },
  { value: "afterhours", label: "After" },
];

type Recruiter = {
  user_id: string;
  full_name: string;
  email?: string | null;
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
  adjustments: PayrollAdjustment[];
  is_checked: boolean;
};

const WITH_CARD_RATE = 65;
const WITHOUT_CARD_RATE = 130;
const FOOD_ALLOWANCE = 0;
const AFTERHOURS_FOOD_ALLOWANCE = 0;
const MAX_PTO_DAYS_PER_YEAR = 3;

const getFoodAllowance = (role: string) => 0;

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

const blankRow = (user_id: string, month: string, name: string, role: string): PaymentRow => ({
  user_id,
  month,
  base_salary: 0,
  extra_days: 0,
  lost_days: 0,
  with_card_days: 0,
  without_card_days: 0,
  food_allowance: getFoodAllowance(role),
  recruiter_name: name,
  extra_day_dates: [],
  lost_day_dates: [],
  adjustments: [],
  is_checked: false,
});

// Current YYYY-MM in Chicago timezone
const getChicagoYearMonth = (): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
};

// How many whole months `month` (YYYY-MM) is before the current Chicago month.
// 0 = current, 1 = last month, negative = future.
const monthsBeforeNow = (month: string): number => {
  const cur = getChicagoYearMonth();
  const [cy, cm] = cur.split("-").map(Number);
  const [my, mm] = month.split("-").map(Number);
  return (cy - my) * 12 + (cm - mm);
};

// Propagation is allowed only when editing current month, previous month,
// or any future month. Anything 2+ months in the past stays isolated.
const canPropagateBaseSalary = (month: string): boolean => monthsBeforeNow(month) <= 1;

export default function RecruitingTab({ monthOptions }: { monthOptions: MonthOption[] }) {
  const queryClient = useQueryClient();
  const defaultMonth = monthOptions[0]?.value ?? "all";
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [selectedRole, setSelectedRole] = useState<string>("recruiting");
  const [previewRow, setPreviewRow] = useState<PaymentRow | null>(null);
  const [previewEmail, setPreviewEmail] = useState<string | null>(null);
  const [baseSalaryEditing, setBaseSalaryEditing] = useState<Record<string, string>>({});

  // Fetch users with the selected role
  const { data: recruiters = [] } = useQuery<Recruiter[]>({
    queryKey: ["recruiting-users", selectedRole],
    queryFn: async () => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", selectedRole as any);
      if (roleErr) throw roleErr;
      const ids = (roleRows ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, office")
        .in("user_id", ids);
      if (profErr) throw profErr;
      let filtered = profs ?? [];
      if (selectedRole === "safety") {
        filtered = filtered.filter((p: any) => p.office != null && p.office !== "");
      }
      return filtered
        .map((p: any) => ({ user_id: p.user_id, full_name: p.full_name || p.email || "Unknown", email: p.email }))
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
          adjustments: Array.isArray(row.adjustments) ? row.adjustments : [],
          is_checked: row.is_checked ?? false,
        } as PaymentRow;
      });
      return map;
    },
    enabled: !!selectedMonth && selectedMonth !== "all",
  });

  // Fetch latest prior base_salary per visible user (most recent month < selectedMonth with > 0).
  // Used to auto-inherit base salary into a month that doesn't yet have its own row.
  const recruiterIdsKey = useMemo(
    () => recruiters.map((r) => r.user_id).sort().join(","),
    [recruiters],
  );
  const { data: priorBaseSalaries = {} as Record<string, number> } = useQuery({
    queryKey: ["recruiter-prior-base-salaries", selectedMonth, recruiterIdsKey],
    queryFn: async () => {
      if (!selectedMonth || selectedMonth === "all" || recruiters.length === 0) return {};
      const ids = recruiters.map((r) => r.user_id);
      const { data, error } = await supabase
        .from("recruiter_salary_payments" as any)
        .select("user_id, month, base_salary")
        .in("user_id", ids)
        .lt("month", selectedMonth)
        .gt("base_salary", 0)
        .order("month", { ascending: false });
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (map[r.user_id] === undefined) map[r.user_id] = Number(r.base_salary) || 0;
      });
      return map;
    },
    enabled: !!selectedMonth && selectedMonth !== "all" && recruiters.length > 0,
  });

  const [rows, setRows] = useState<Record<string, PaymentRow>>({});
  const rowsRef = useRef<Record<string, PaymentRow>>({});
  // Tracks whether the next save for a given user must also propagate base_salary forward.
  const pendingBasePropagation = useRef<Record<string, boolean>>({});
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSavedAt = useRef<Record<string, number>>({});

  // PTO state: userId -> all YYYY-MM-DD PTO dates for the selected year.
  // Reuses the existing dispatcher_sick_days table (keyed by user_id only).
  const [ptoByUser, setPtoByUser] = useState<Record<string, string[]>>({});

  const selectedYear = useMemo(() => {
    if (!selectedMonth || selectedMonth === "all") return null;
    const y = parseInt(selectedMonth.split("-")[0], 10);
    return Number.isFinite(y) ? y : null;
  }, [selectedMonth]);

  // Fetch PTO days for the year for visible users
  useEffect(() => {
    if (!selectedYear || recruiters.length === 0) {
      setPtoByUser({});
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = recruiters.map((r) => r.user_id);
      const { data, error } = await supabase
        .from("dispatcher_sick_days" as any)
        .select("user_id, sick_date")
        .in("user_id", ids)
        .eq("year", selectedYear);
      if (cancelled) return;
      if (error) {
        console.error("Error fetching PTO days:", error);
        return;
      }
      const map: Record<string, string[]> = {};
      (data ?? []).forEach((r: any) => {
        if (!map[r.user_id]) map[r.user_id] = [];
        map[r.user_id].push(r.sick_date);
      });
      setPtoByUser(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, recruiters]);

  const getMonthPto = (userId: string): string[] =>
    (ptoByUser[userId] ?? []).filter((d) => d.substring(0, 7) === selectedMonth);
  const getYearPtoCount = (userId: string) => (ptoByUser[userId] ?? []).length;

  const togglePto = async (userId: string, date: string) => {
    if (!selectedYear) return;
    const current = ptoByUser[userId] ?? [];
    const isOn = current.includes(date);
    if (!isOn && current.length >= MAX_PTO_DAYS_PER_YEAR) {
      toast.error(`Maximum ${MAX_PTO_DAYS_PER_YEAR} PTO days per year`);
      return;
    }
    // Optimistic update
    const next = isOn ? current.filter((d) => d !== date) : [...current, date].sort();
    setPtoByUser((prev) => ({ ...prev, [userId]: next }));
    try {
      if (isOn) {
        const { error } = await supabase
          .from("dispatcher_sick_days" as any)
          .delete()
          .eq("user_id", userId)
          .eq("sick_date", date);
        if (error) throw error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("dispatcher_sick_days" as any).insert({
          user_id: userId,
          sick_date: date,
          year: selectedYear,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      // Revert
      setPtoByUser((prev) => ({ ...prev, [userId]: current }));
      toast.error("Failed to save PTO: " + (err?.message || "unknown"));
    }
  };

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
        if (local && local.month === selectedMonth && isDirty(r.user_id)) {
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
            adjustments: server.adjustments ?? [],
            is_checked: server.is_checked ?? false,
          };
        } else {
          const blank = blankRow(r.user_id, selectedMonth, r.full_name, selectedRole);
          const inherited = priorBaseSalaries[r.user_id];
          if (inherited && inherited > 0) blank.base_salary = inherited;
          next[r.user_id] = blank;
        }
      });
      rowsRef.current = next;
      return next;
    });
  }, [recruiters, paymentsData, selectedMonth, priorBaseSalaries]);

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
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recruiter-salary-payments", selectedMonth] });
          queryClient.invalidateQueries({ queryKey: ["recruiter-prior-base-salaries"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedMonth, queryClient]);

  // Realtime: refresh the recruiter list when role assignments or profiles change.
  useEffect(() => {
    const channel = supabase
      .channel(`recruiting-users-${selectedRole}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recruiting-users", selectedRole] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recruiting-users", selectedRole] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRole, queryClient]);

  const workDaysInMonth = useMemo(() => {
    if (!selectedMonth || selectedMonth === "all") return 22;
    const [y, m] = selectedMonth.split("-").map(Number);
    if (!y || !m) return 22;
    return getWorkDaysInMonth(y, m - 1);
  }, [selectedMonth]);

  const computeSalary = (r: PaymentRow) => {
    const withCard = showCardColumns ? r.with_card_days : 0;
    const withoutCard = showCardColumns ? r.without_card_days : 0;
    const perDayBase =
      r.base_salary +
      withCard * WITH_CARD_RATE +
      withoutCard * WITHOUT_CARD_RATE;
    const perDay = workDaysInMonth > 0 ? perDayBase / workDaysInMonth : 0;
    const adjTotal = (r.adjustments ?? []).reduce((sum, a) => {
      if (a.type === "addition") return sum + a.amount;
      if (a.type === "charge") return sum - a.amount;
      if (a.type === "penalty" && a.applied) return sum - a.amount;
      return sum;
    }, 0);
    // PTO days don't reduce salary
    const ptoCount = getMonthPto(r.user_id).length;
    const nonPtoLostDays = Math.max(0, r.lost_days - ptoCount);
    return (
      r.base_salary +
      r.extra_days * perDay -
      nonPtoLostDays * perDay +
      withCard * WITH_CARD_RATE +
      withoutCard * WITHOUT_CARD_RATE +
      adjTotal
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
      adjustments: (row.adjustments ?? []).length > 0 ? row.adjustments : null,
      is_checked: row.is_checked,
    };
    const { error } = await supabase
      .from("recruiter_salary_payments" as any)
      .upsert(payload, { onConflict: "user_id,month" });
    if (error) {
      toast.error("Failed to save: " + error.message);
      return false;
    }
    // Propagate base_salary to all later months when allowed (current, last, or future month edits).
    const propKey = `${row.user_id}|${row.month}`;
    if (pendingBasePropagation.current[propKey]) {
      delete pendingBasePropagation.current[propKey];
      if (canPropagateBaseSalary(row.month)) {
        const { error: propErr } = await supabase
          .from("recruiter_salary_payments" as any)
          .update({ base_salary: row.base_salary })
          .eq("user_id", row.user_id)
          .gt("month", row.month);
        if (propErr) {
          toast.error("Failed to propagate base salary: " + propErr.message);
        } else {
          queryClient.invalidateQueries({ queryKey: ["recruiter-salary-payments"] });
          queryClient.invalidateQueries({ queryKey: ["recruiter-prior-base-salaries"] });
        }
      }
    }
    return true;
  };

  const toggleChecked = async (userId: string, currentChecked: boolean) => {
    if (!selectedMonth || selectedMonth === "all") return;
    const nextChecked = !currentChecked;
    setRows((prev) => {
      const cur = prev[userId];
      if (!cur) return prev;
      const updated = { ...cur, is_checked: nextChecked };
      const next = { ...prev, [userId]: updated };
      rowsRef.current = next;
      return next;
    });
    const { error } = await supabase
      .from("recruiter_salary_payments" as any)
      .update({ is_checked: nextChecked })
      .eq("user_id", userId)
      .eq("month", selectedMonth);
    if (error) {
      toast.error("Failed to update checked status");
      // revert on error
      setRows((prev) => {
        const cur = prev[userId];
        if (!cur) return prev;
        const updated = { ...cur, is_checked: currentChecked };
        const next = { ...prev, [userId]: updated };
        rowsRef.current = next;
        return next;
      });
    }
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
    // If the removed lost-day was marked as PTO, also remove the PTO entry.
    if (field === "lost_day_dates") {
      const ptoList = ptoByUser[userId] ?? [];
      if (ptoList.includes(date)) {
        togglePto(userId, date);
      }
    }
  };

  const monthDisabled = !selectedMonth || selectedMonth === "all";
  const showCardColumns = selectedRole === "recruiting";

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="flex flex-wrap items-center gap-1 text-base sm:text-lg">
            {ROLE_OPTIONS.map((r, i) => (
              <span key={r.value} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground/40">/</span>}
                <button
                  type="button"
                  onClick={() => setSelectedRole(r.value)}
                  className={
                    selectedRole === r.value
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground/50 hover:text-muted-foreground font-normal"
                  }
                >
                  {r.label}
                </button>
              </span>
            ))}
          </CardTitle>
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
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Recruiter</TableHead>
                  <TableHead className="text-right w-[140px]">Base Salary</TableHead>
                  <TableHead className="text-right w-[100px]">Extra Days</TableHead>
                  <TableHead className="text-right w-[100px]">Lost Days</TableHead>
                  {showCardColumns && (
                    <>
                      <TableHead className="text-right w-[110px]">With Card</TableHead>
                      <TableHead className="text-right w-[120px]">Without Card</TableHead>
                    </>
                  )}
                  <TableHead className="text-right w-[110px]">Adjustments</TableHead>
                  <TableHead className="text-right w-[120px]">Salary</TableHead>
                  <TableHead className="text-right w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recruiters.map((r) => {
                  const row = rows[r.user_id];
                  if (!row) return null;
                  const salary = computeSalary(row);
                  return (
                    <TableRow key={r.user_id} className={row.is_checked ? "bg-green-100 dark:bg-green-950/30" : ""}>
                      <TableCell className="w-[40px]">
                        <Checkbox
                          checked={row.is_checked}
                          onCheckedChange={() => toggleChecked(r.user_id, row.is_checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          className="h-8 text-right border-0 bg-transparent shadow-none focus-visible:ring-1 px-1"
                          value={
                            baseSalaryEditing[r.user_id] !== undefined
                              ? baseSalaryEditing[r.user_id]
                              : row.base_salary === 0
                                ? ""
                                : String(row.base_salary)
                          }
                          onChange={(e) => {
                            let raw = e.target.value.replace(/[^\d.]/g, "");
                            // keep only the first decimal point
                            const firstDot = raw.indexOf(".");
                            if (firstDot !== -1) {
                              raw =
                                raw.slice(0, firstDot + 1) +
                                raw.slice(firstDot + 1).replace(/\./g, "");
                            }
                            setBaseSalaryEditing((prev) => ({ ...prev, [r.user_id]: raw }));
                            const num = raw === "" || raw === "." ? 0 : Number(raw) || 0;
                            if (rowsRef.current[r.user_id]?.base_salary !== num) {
                              pendingBasePropagation.current[r.user_id] = true;
                            }
                            updateField(r.user_id, { base_salary: num });
                          }}
                          onBlur={() => {
                            setBaseSalaryEditing((prev) => {
                              const next = { ...prev };
                              delete next[r.user_id];
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <DatesCell
                        label="Extra Days"
                        accent="text-green-600"
                        sign="+"
                        month={selectedMonth}
                        dates={row.extra_day_dates}
                        onAdd={(d) => addDayDate(r.user_id, "extra_day_dates", d)}
                        onRemove={(d) => removeDayDate(r.user_id, "extra_day_dates", d)}
                      />
                      <DatesCell
                        label="Days Off"
                        accent="text-red-600"
                        sign="-"
                        month={selectedMonth}
                        dates={row.lost_day_dates}
                        onAdd={(d) => addDayDate(r.user_id, "lost_day_dates", d)}
                        onRemove={(d) => removeDayDate(r.user_id, "lost_day_dates", d)}
                        pto={{
                          selected: getMonthPto(r.user_id),
                          onToggle: (d) => togglePto(r.user_id, d),
                          yearUsed: getYearPtoCount(r.user_id),
                          yearMax: MAX_PTO_DAYS_PER_YEAR,
                        }}
                      />
                      {showCardColumns && (
                        <>
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
                        </>
                      )}
                      <AdjustmentsCell
                        adjustments={row.adjustments ?? []}
                        onChange={(adj) => updateField(r.user_id, { adjustments: adj }, 0)}
                      />
                      <TableCell className="text-right font-semibold">
                        ${salary.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Preview statement"
                          onClick={async () => {
                            await saveRow(row);
                            setPreviewEmail(r.email ?? null);
                            setPreviewRow(row);
                          }}
                        >
                          <Send className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recruiters.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showCardColumns ? 10 : 8} className="text-center text-muted-foreground">
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
    {previewRow && (
      <RecruiterStatementPreviewDialog
        open={!!previewRow}
        onOpenChange={(o) => !o && setPreviewRow(null)}
        onAdjustmentsChange={(next) => {
          if (!previewRow) return;
          setRows((prev) => {
            const cur = prev[previewRow.user_id];
            if (!cur) return prev;
            const updated = { ...cur, adjustments: next };
            const nextRows = { ...prev, [previewRow.user_id]: updated };
            rowsRef.current = nextRows;
            return nextRows;
          });
          lastSavedAt.current[previewRow.user_id] = Date.now();
        }}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ["recruiter-salary-payments", selectedMonth] });
        }}
        onPtoChanged={(userId, _ptoMonthCount) => {
          // Refetch PTO for current year so salary cells recompute live.
          if (!selectedYear) return;
          (async () => {
            const { data } = await supabase
              .from("dispatcher_sick_days" as any)
              .select("sick_date")
              .eq("user_id", userId)
              .eq("year", selectedYear);
            const list = (data ?? []).map((r: any) => r.sick_date as string);
            setPtoByUser((prev) => ({ ...prev, [userId]: list }));
          })();
        }}
        data={{
          userId: previewRow.user_id,
          recruiterEmail: previewEmail,
          recruiterName: previewRow.recruiter_name ?? "Recruiter",
          month: previewRow.month,
          baseSalary: previewRow.base_salary,
          workDaysInMonth,
          perDayRate:
            workDaysInMonth > 0
              ? (previewRow.base_salary +
                  previewRow.with_card_days * WITH_CARD_RATE +
                  previewRow.without_card_days * WITHOUT_CARD_RATE) /
                workDaysInMonth
              : 0,
          extraDayDates: previewRow.extra_day_dates,
          lostDayDates: previewRow.lost_day_dates,
          withCardDays: previewRow.with_card_days,
          withoutCardDays: previewRow.without_card_days,
          withCardRate: WITH_CARD_RATE,
          withoutCardRate: WITHOUT_CARD_RATE,
          foodAllowance: previewRow.food_allowance,
          total: computeSalary(previewRow),
          adjustments: previewRow.adjustments ?? [],
          sickDayDates: getMonthPto(previewRow.user_id),
          totalSickDaysAvailable: MAX_PTO_DAYS_PER_YEAR,
          usedPtoDaysYearly: getYearPtoCount(previewRow.user_id),
        }}
      />
    )}
    </>
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
  month,
  dates,
  onAdd,
  onRemove,
  pto,
}: {
  label: string;
  accent: string;
  sign: "+" | "-";
  month: string;
  dates: string[];
  onAdd: (d: string) => void;
  onRemove: (d: string) => void;
  pto?: {
    selected: string[];
    onToggle: (date: string) => void;
    yearUsed: number;
    yearMax: number;
  };
}) {
  const count = dates.length;
  const ptoMonthCount = pto ? dates.filter((d) => pto.selected.includes(d)).length : 0;
  const remainingPto = pto ? Math.max(0, pto.yearMax - pto.yearUsed) : 0;
  return (
    <TableCell className={`text-right ${accent}`}>
      <Popover>
        <PopoverTrigger asChild>
          <button className="cursor-pointer hover:underline font-medium">
            {count > 0 ? `${sign}${count}` : 0}
            {pto && ptoMonthCount > 0 && (
              <span className="ml-1 text-[10px] text-green-600">({ptoMonthCount} PTO)</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="end">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {pto && (
              <p className="text-[10px] text-muted-foreground">
                {remainingPto} of {pto.yearMax} PTO days remaining this year.
              </p>
            )}
            {dates.length === 0 && (
              <p className="text-xs text-muted-foreground">No dates</p>
            )}
            {dates.map((d) => {
              const [y, m, day] = d.split("-").map(Number);
              const isPto = pto ? pto.selected.includes(d) : false;
              const canTogglePtoOn = pto ? isPto || remainingPto > 0 : false;
              return (
                <div key={d} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground flex-1">{`${m}/${day}`}</span>
                  {pto && (
                    <label
                      className={`flex items-center gap-1 text-[10px] ${canTogglePtoOn ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                      title={isPto ? "Marked as PTO" : canTogglePtoOn ? "Mark as PTO" : "No PTO days remaining this year"}
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={isPto}
                        disabled={!canTogglePtoOn}
                        onChange={() => pto.onToggle(d)}
                      />
                      <span className={isPto ? "text-green-600 font-medium" : "text-muted-foreground"}>PTO</span>
                    </label>
                  )}
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
              <p className="text-xs font-medium text-muted-foreground mb-1">Add day</p>
              <DayInput month={month} onPick={onAdd} />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TableCell>
  );
}

function AdjustmentsCell({
  adjustments,
  onChange,
}: {
  adjustments: PayrollAdjustment[];
  onChange: (next: PayrollAdjustment[]) => void;
}) {
  const [type, setType] = useState<"addition" | "charge" | "penalty">("addition");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [applied, setApplied] = useState(true);

  const netDelta = adjustments.reduce((s, a) => {
    if (a.type === "addition") return s + a.amount;
    if (a.type === "charge") return s - a.amount;
    if (a.type === "penalty" && a.applied) return s - a.amount;
    return s;
  }, 0);

  const handleAdd = () => {
    if (!reason.trim()) {
      toast.error("Enter a reason");
      return;
    }
    const n = Number(amount);
    if (!isFinite(n) || n < 0) {
      toast.error("Invalid amount");
      return;
    }
    const next: PayrollAdjustment = {
      type,
      reason: reason.trim(),
      amount: n,
      ...(type === "penalty" ? { applied } : {}),
    };
    onChange([...adjustments, next]);
    setReason("");
    setAmount("");
    setApplied(true);
  };

  const handleRemove = (idx: number) => {
    onChange(adjustments.filter((_, i) => i !== idx));
  };

  const togglePenalty = (idx: number) => {
    onChange(
      adjustments.map((a, i) =>
        i === idx && a.type === "penalty" ? { ...a, applied: !a.applied } : a,
      ),
    );
  };

  return (
    <TableCell className="text-right">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8">
            {adjustments.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className={netDelta >= 0 ? "text-green-600" : "text-red-600"}>
                {netDelta >= 0 ? "+" : ""}${netDelta.toFixed(2)}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Adjustments</p>
            {adjustments.length === 0 && (
              <p className="text-xs text-muted-foreground">None</p>
            )}
            {adjustments.map((a, i) => {
              const sign =
                a.type === "addition" ? "+" : a.type === "penalty" && !a.applied ? "" : "-";
              const color =
                a.type === "addition"
                  ? "text-green-600"
                  : a.type === "penalty" && !a.applied
                    ? "text-muted-foreground"
                    : "text-red-600";
              const label =
                a.type === "addition"
                  ? "Extra"
                  : a.type === "charge"
                    ? "Charge"
                    : a.applied
                      ? "Penalty"
                      : "Warning";
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
                  <span className="flex-1 truncate" title={a.reason}>{a.reason}</span>
                  <span className={`tabular-nums ${color}`}>
                    {sign}${a.amount.toFixed(2)}
                  </span>
                  {a.type === "penalty" && (
                    <button
                      className="text-[10px] underline text-muted-foreground hover:text-foreground"
                      onClick={() => togglePenalty(i)}
                      title="Toggle applied"
                    >
                      {a.applied ? "applied" : "warn"}
                    </button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            <div className="border-t pt-2 mt-2 space-y-2">
              <div className="flex gap-1">
                {(["addition", "charge", "penalty"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={type === t ? "default" : "outline"}
                    size="sm"
                    className="h-6 px-2 text-[10px] capitalize flex-1"
                    onClick={() => setType(t)}
                  >
                    {t === "addition" ? "Extra" : t}
                  </Button>
                ))}
              </div>
              <Input
                placeholder="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-7 text-xs"
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="$ Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-7 text-xs"
                />
                <Button size="sm" className="h-7 px-3" onClick={handleAdd}>
                  Add
                </Button>
              </div>
              {type === "penalty" && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={applied}
                    onChange={(e) => setApplied(e.target.checked)}
                  />
                  Deduct from check (uncheck for warning only)
                </label>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TableCell>
  );
}