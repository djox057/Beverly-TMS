import { useState } from "react";
import { format, addDays } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
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
  { key: "truck", label: "Truck#", width: "110px" },
  { key: "note", label: "Note", width: "1fr" },
];

const WIDE_NOTE_COLS: DailyReportColumn[] = [
  { key: "truck", label: "Truck#", width: "110px" },
  { key: "note", label: "Note", width: "1fr" },
];

const OfficeTab = ({ office }: { office: string }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <DailyReportTable
      title={`${office} — Empty & Late for delivery`}
      columns={EMPTY_LATE_COLS}
      initialRows={10}
    />
    <DailyReportTable title={`${office} — Home`} columns={HOME_COLS} initialRows={10} />
  </div>
);

const DailyReport = () => {
  const [date, setDate] = useState<Date>(() => getChicagoToday());
  const [activeTab, setActiveTab] = useState<string>("CACAK");

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Beverly Daily Report</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate((d) => addDays(d, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="font-normal px-3">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "MM/dd/yyyy")}
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
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate((d) => addDays(d, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 sm:grid-cols-7 h-auto gap-1 p-1">
          {OFFICES.map((o) => (
            <TabsTrigger
              key={o}
              value={o}
              className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight"
            >
              {o}
            </TabsTrigger>
          ))}
          <TabsTrigger value="MAINTENANCE" className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight">
            Maintenance
          </TabsTrigger>
          <TabsTrigger value="AFTERHOURS" className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight">
            Afterhours
          </TabsTrigger>
          <TabsTrigger value="RECOVERIES" className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight">
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