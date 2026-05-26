import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

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
  paid: boolean;
  paid_amount: number | null;
  calculated_salary: number | null;
  is_checked: boolean;
  recruiter_name?: string | null;
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
  paid: false,
  paid_amount: null,
  calculated_salary: null,
  is_checked: false,
  recruiter_name: name,
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
        map[row.user_id] = row as PaymentRow;
      });
      return map;
    },
    enabled: !!selectedMonth && selectedMonth !== "all",
  });

  const [rows, setRows] = useState<Record<string, PaymentRow>>({});

  useEffect(() => {
    if (!recruiters.length || !selectedMonth || selectedMonth === "all") {
      setRows({});
      return;
    }
    const next: Record<string, PaymentRow> = {};
    recruiters.forEach((r) => {
      next[r.user_id] = paymentsData?.[r.user_id]
        ? { ...paymentsData[r.user_id], recruiter_name: r.full_name }
        : blankRow(r.user_id, selectedMonth, r.full_name);
    });
    setRows(next);
  }, [recruiters, paymentsData, selectedMonth]);

  // Realtime
  useEffect(() => {
    if (!selectedMonth || selectedMonth === "all") return;
    const channel = supabase
      .channel("recruiter-salaries-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recruiter_salary_payments" },
        () => queryClient.invalidateQueries({ queryKey: ["recruiter-salary-payments", selectedMonth] }),
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
      extra_days: row.extra_days,
      lost_days: row.lost_days,
      with_card_days: row.with_card_days,
      without_card_days: row.without_card_days,
      food_allowance: row.food_allowance,
      paid: row.paid,
      paid_amount: row.paid_amount,
      calculated_salary: row.calculated_salary,
      is_checked: row.is_checked,
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

  const updateField = async (userId: string, patch: Partial<PaymentRow>) => {
    const current = rows[userId];
    if (!current) return;
    const updated = { ...current, ...patch };
    setRows((p) => ({ ...p, [userId]: updated }));
    await saveRow(updated);
  };

  const togglePaid = async (userId: string) => {
    const r = rows[userId];
    if (!r) return;
    const salary = computeSalary(r);
    const updated: PaymentRow = {
      ...r,
      paid: !r.paid,
      paid_amount: !r.paid ? salary : null,
      calculated_salary: !r.paid ? salary : null,
    };
    setRows((p) => ({ ...p, [userId]: updated }));
    await saveRow(updated);
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
                  <TableHead className="text-right w-[110px]">Paid</TableHead>
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
                          type="number"
                          className="h-8 text-right"
                          value={row.base_salary}
                          onChange={(e) =>
                            setRows((p) => ({
                              ...p,
                              [r.user_id]: { ...row, base_salary: Number(e.target.value) || 0 },
                            }))
                          }
                          onBlur={() => saveRow(rows[r.user_id])}
                        />
                      </TableCell>
                      <CounterCell
                        value={row.extra_days}
                        onChange={(v) => updateField(r.user_id, { extra_days: v })}
                      />
                      <CounterCell
                        value={row.lost_days}
                        onChange={(v) => updateField(r.user_id, { lost_days: v })}
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
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Checkbox checked={row.paid} onCheckedChange={() => togglePaid(r.user_id)} />
                          {row.paid && row.paid_amount != null && (
                            <span className="text-xs text-muted-foreground">
                              ${Number(row.paid_amount).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recruiters.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
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