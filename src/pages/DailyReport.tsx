import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailyReportTable, type DailyReportColumn } from "@/components/dailyReport/DailyReportTable";
import { cn } from "@/lib/utils";
import { getChicagoToday } from "@/pages/Reports/helpers";

const OFFICES = ["CACAK", "KRAGUJEVAC", "BG 1st FLOOR", "BG 4th FLOOR"] as const;

const EMPTY_LATE_COLS: DailyReportColumn[] = [
  { key: "truck", label: "Truck#", width: "110px" },
  { key: "note", label: "Note", width: "1fr" },
];

const HOME_COLS: DailyReportColumn[] = [
  { key: "truck", label: "Truck", width: "110px" },
  { key: "note", label: "Note", width: "1fr" },
];

const WIDE_NOTE_COLS: DailyReportColumn[] = [
  { key: "truck", label: "Truck", width: "110px" },
  { key: "note", label: "Note", width: "1fr" },
];

const OfficeTab = ({ office }: { office: string }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <DailyReportTable
      title={`${office} — Empty & Late for delivery`}
      columns={EMPTY_LATE_COLS}
    />
    <DailyReportTable title={`${office} — Home`} columns={HOME_COLS} />
  </div>
);

const DailyReport = () => {
  const [date, setDate] = useState<Date>(() => getChicagoToday());
  const [activeTab, setActiveTab] = useState<string>("CACAK");

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Beverly Daily Report</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[220px] justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, "MM/dd/yyyy") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto justify-start">
          {OFFICES.map((o) => (
            <TabsTrigger key={o} value={o} className="text-xs sm:text-sm">
              {o}
            </TabsTrigger>
          ))}
          <TabsTrigger value="MAINTENANCE" className="text-xs sm:text-sm">
            Maintenance
          </TabsTrigger>
          <TabsTrigger value="AFTERHOURS" className="text-xs sm:text-sm">
            Afterhours
          </TabsTrigger>
          <TabsTrigger value="RECOVERIES" className="text-xs sm:text-sm">
            Recoveries
          </TabsTrigger>
        </TabsList>

        {OFFICES.map((o) => (
          <TabsContent key={o} value={o} className="mt-4">
            <OfficeTab office={o} />
          </TabsContent>
        ))}

        <TabsContent value="MAINTENANCE" className="mt-4">
          <DailyReportTable title="Maintenance" columns={WIDE_NOTE_COLS} initialRows={12} />
        </TabsContent>
        <TabsContent value="AFTERHOURS" className="mt-4">
          <DailyReportTable title="After Hours" columns={WIDE_NOTE_COLS} initialRows={12} />
        </TabsContent>
        <TabsContent value="RECOVERIES" className="mt-4">
          <DailyReportTable title="Recoveries" columns={WIDE_NOTE_COLS} initialRows={10} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DailyReport;