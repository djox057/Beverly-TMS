import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, MessageSquare, Timer, Search, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRingCentralActivity, useCanViewPhoneActivity } from "@/hooks/useRingCentralActivity";
import { formatDuration } from "@/utils/formatDuration";

const shiftDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

interface Props {
  /** Restrict to one Beverly user (dispatcher detail page). */
  userId?: string | null;
  title?: string;
}

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "1", label: "Today" },
];

const RingCentralActivityPanel = ({ userId = null, title = "Phone Activity" }: Props) => {
  const canView = useCanViewPhoneActivity();
  const [range, setRange] = useState("30");
  const [extensionId, setExtensionId] = useState<string>("all");
  const [phoneNumber, setPhoneNumber] = useState<string>("all");
  const [externalInput, setExternalInput] = useState("");
  const [externalNumber, setExternalNumber] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string>("all");

  const dateTo = useMemo(() => shiftDays(0), []);
  const dateFrom = useMemo(() => shiftDays(-(Number(range) - 1)), [range]);

  const { data, isLoading, isError, error, refetch, isFetching } = useRingCentralActivity({
    dateFrom,
    dateTo,
    userId,
    extensionId: extensionId === "all" ? null : extensionId,
    phoneNumber: phoneNumber === "all" ? null : phoneNumber,
    externalNumber,
  });

  // Drivers with a phone number, so activity can be filtered to one driver.
  const { data: drivers } = useQuery({
    queryKey: ["rc-activity-drivers", userId],
    enabled: canView,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from("drivers")
        .select("id, name, phone, dispatcher_id, is_active")
        .not("phone", "is", null)
        .order("name", { ascending: true });
      if (userId) query = query.eq("dispatcher_id", userId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).filter((d) => (d.phone ?? "").trim().length >= 10);
    },
  });

  if (!canView) return null;

  const extensions = data?.extensions ?? [];
  const scopedExtensions = userId ? extensions.filter((e) => e.user_id === userId) : extensions;
  const numbers = Array.from(
    new Set(scopedExtensions.map((e) => e.primary_phone_number).filter((n): n is string => !!n)),
  );

  const calls = data?.calls;
  const messages = data?.messages;
  const sync = data?.sync;
  const syncBlocked = sync?.errorCategory === "permission";

  const selectDriver = (value: string) => {
    setDriverId(value);
    if (value === "all") {
      setExternalNumber(null);
      setExternalInput("");
      return;
    }
    const driver = (drivers ?? []).find((d) => d.id === value);
    const phone = (driver?.phone ?? "").trim();
    setExternalInput(phone);
    setExternalNumber(phone || null);
  };

  const chartData = (data?.daily ?? []).map((d) => ({
    date: d.date.slice(5),
    inbound: d.calls.inbound,
    outbound: d.calls.outbound,
    messages: d.messages.total,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <Phone className="h-4 w-4" />
          <span>{title}</span>
          {sync && (
            <Badge
              variant={sync.lastSuccessfulSync && !syncBlocked ? "secondary" : "destructive"}
              className="text-xs"
            >
              {syncBlocked
                ? "Sync blocked — RingCentral permissions"
                : sync.lastSuccessfulSync
                  ? `Synced ${new Date(sync.lastSuccessfulSync).toLocaleString("en-US", { timeZone: "America/Chicago" })}`
                  : "Never synced"}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 ml-auto"
            onClick={() => refetch()}
            aria-label="Refresh phone activity"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={extensionId} onValueChange={setExtensionId}>
            <SelectTrigger className="w-[210px] h-9">
              <SelectValue placeholder="All extensions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All extensions</SelectItem>
              {scopedExtensions.map((e) => (
                <SelectItem key={e.rc_extension_id} value={e.rc_extension_id}>
                  {e.rc_name || e.extension_number || e.rc_extension_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={phoneNumber} onValueChange={setPhoneNumber}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="All numbers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All numbers</SelectItem>
              {numbers.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Select value={driverId} onValueChange={selectDriver}>
              <SelectTrigger className="w-[230px] h-9">
                <SelectValue placeholder="Activity with driver" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">Activity with driver…</SelectItem>
                {(drivers ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}{d.is_active === false ? " (inactive)" : ""} · {d.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={externalInput}
              onChange={(e) => setExternalInput(e.target.value)}
              placeholder="External number (driver/broker)"
              className="h-9 w-[220px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") setExternalNumber(externalInput.trim() || null);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setExternalNumber(externalInput.trim() || null)}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
            {externalNumber && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setExternalNumber(null);
                  setExternalInput("");
                  setDriverId("all");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {syncBlocked && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            RingCentral sync is blocked: the connected RingCentral app is missing the
            {" "}<span className="font-medium">ReadAccounts</span>,{" "}
            <span className="font-medium">ReadCallLog</span> and{" "}
            <span className="font-medium">ReadMessages</span> application permissions. Enable them in the
            RingCentral Developer Console and re-authorize, then run a sync — no call or message data can be
            pulled until then.
          </div>
        )}

        {isError && (
          <div className="text-sm text-destructive">
            Could not load phone activity{error instanceof Error ? `: ${error.message}` : ""}.
          </div>
        )}

        {isLoading ? (
          <div className="py-6 text-sm text-muted-foreground">Loading phone activity...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              <Metric label="Total calls" icon={<Phone className="h-3 w-3" />} value={calls?.total ?? 0} />
              <Metric label="Answered" icon={<PhoneIncoming className="h-3 w-3" />} value={calls?.answered ?? 0} />
              <Metric label="Missed" icon={<PhoneMissed className="h-3 w-3" />} value={calls?.missed ?? 0} />
              <Metric
                label="Talk time"
                icon={<Timer className="h-3 w-3" />}
                value={formatDuration(calls?.liveTalkSeconds)}
              />
              <Metric
                label="Avg call"
                icon={<Timer className="h-3 w-3" />}
                value={formatDuration(calls?.averageAnsweredDurationSeconds)}
              />
              <Metric label="SMS/MMS" icon={<MessageSquare className="h-3 w-3" />} value={messages?.total ?? 0} />
              <Metric label="Inbound msgs" icon={<PhoneIncoming className="h-3 w-3" />} value={messages?.inbound ?? 0} />
              <Metric label="Outbound msgs" icon={<PhoneOutgoing className="h-3 w-3" />} value={messages?.outbound ?? 0} />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Inbound calls {calls?.inbound ?? 0}</Badge>
              <Badge variant="outline">Outbound calls {calls?.outbound ?? 0}</Badge>
              <Badge variant="outline">Total duration {formatDuration(calls?.totalDurationSeconds)}</Badge>
              <Badge variant="outline">Failed msgs {messages?.failed ?? 0}</Badge>
            </div>

            {chartData.length > 0 && (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="inbound" name="Inbound calls" fill="hsl(var(--primary))" />
                    <Bar dataKey="outbound" name="Outbound calls" fill="hsl(var(--muted-foreground))" />
                    <Bar dataKey="messages" name="Messages" fill="hsl(var(--accent-foreground))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {!externalNumber && (data?.byExtension?.length ?? 0) > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Extension</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="text-right">Answered</TableHead>
                      <TableHead className="text-right">Missed</TableHead>
                      <TableHead className="text-right">Talk time</TableHead>
                      <TableHead className="text-right">SMS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...(data?.byExtension ?? [])]
                      .sort((a, b) => b.calls.total - a.calls.total)
                      .map((row) => (
                        <TableRow key={row.extensionId}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-muted-foreground">{row.phoneNumber || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.calls.total}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.calls.inbound}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.calls.outbound}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.calls.answered}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.calls.missed}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatDuration(row.calls.liveTalkSeconds)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.messages.total}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {(calls?.total ?? 0) === 0 && (messages?.total ?? 0) === 0 && (
              <div className="text-sm text-muted-foreground">
                No phone activity recorded for this period.
                {sync && !sync.lastSuccessfulSync && " RingCentral activity has not been synced yet."}
                {sync?.errorCategory === "permission" &&
                  " RingCentral is missing the ReadCallLog / ReadMessages application permissions."}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const Metric = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) => (
  <div className="rounded-md border p-3">
    <div className="text-xs text-muted-foreground flex items-center gap-1">
      {icon} {label}
    </div>
    <div className="text-xl font-bold tabular-nums">{value}</div>
  </div>
);

export default RingCentralActivityPanel;