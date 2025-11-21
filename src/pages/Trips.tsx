import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, FileDown, Edit } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDragPan } from "@/hooks/useDragPan";
import { format, startOfWeek, endOfWeek, parseISO, isWithinInterval, getDay, addDays } from "date-fns";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

// Helper to format datetime strings without timezone conversion
const formatDateDisplay = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  try {
    // Parse the date and format as MM/DD/YYYY
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (e) {
    return dateStr;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Delivered":
      return <Badge className="bg-success text-success-foreground">Delivered</Badge>;
    case "In Transit":
      return <Badge className="bg-primary text-primary-foreground">In Transit</Badge>;
    case "Pending":
      return <Badge className="bg-warning text-warning-foreground">Pending</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const Trips = () => {
  useDragPan();
  const navigate = useNavigate();

  const { data: orders, isLoading } = useOrders();
  const [exportedWeeks, setExportedWeeks] = useState<Set<string>>(new Set());

  const [currentPage, setCurrentPage] = useState(1);
  const [truckFilter, setTruckFilter] = useState(() => {
    return localStorage.getItem("trips_truckFilter") || "";
  });
  const [driverFilter, setDriverFilter] = useState(() => {
    return localStorage.getItem("trips_driverFilter") || "";
  });
  const itemsPerPage = 50;

  // Save filters to localStorage when they change
  useEffect(() => {
    localStorage.setItem("trips_truckFilter", truckFilter);
  }, [truckFilter]);

  useEffect(() => {
    localStorage.setItem("trips_driverFilter", driverFilter);
  }, [driverFilter]);

  // Fetch exported weeks on mount
  useEffect(() => {
    const fetchExportedWeeks = async () => {
      const { data, error } = await supabase
        .from("exported_weeks")
        .select("week_start_date, week_end_date");
      
      if (!error && data) {
        const exportedSet = new Set(
          data.map(w => `${w.week_start_date}_${w.week_end_date}`)
        );
        setExportedWeeks(exportedSet);
      }
    };
    fetchExportedWeeks();
  }, []);

  // Filter orders based on truck and driver filters
  const filteredOrders =
    orders?.filter((order) => {
      const matchesTruck = !truckFilter || order.truckNumber?.toLowerCase() === truckFilter.toLowerCase();

      const matchesDriver = !driverFilter || order.driverName?.toLowerCase().includes(driverFilter.toLowerCase());

      // Exclude orders with both freight amount and driver pay equal to 0
      const hasValue =
        (order.totalFreightAmount && order.totalFreightAmount !== 0) ||
        (order.totalDriverPay && order.totalDriverPay !== 0);

      return matchesTruck && matchesDriver && hasValue;
    }) || [];

  // Pagination - paginate individual orders first
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Group paginated orders by week (Monday-Sunday)
  const groupedByWeek = useMemo(() => {
    const groups: { [key: string]: any[] } = {};

    paginatedOrders.forEach((order) => {
      if (order.deliveryDate) {
        try {
          // Parse date string - handle various formats
          const dateStr = String(order.deliveryDate);
          let deliveryDate: Date;

          // If it's a string with time (ISO format)
          if (dateStr.includes("T")) {
            deliveryDate = parseISO(dateStr);
          }
          // If it's a simple date string like "10/20/2025" or "2025-10-20"
          else {
            // Try to parse as-is first
            deliveryDate = new Date(dateStr);

            // If that fails, try adding time
            if (isNaN(deliveryDate.getTime())) {
              deliveryDate = new Date(dateStr + "T00:00:00");
            }
          }

          // Validate the date
          if (isNaN(deliveryDate.getTime())) {
            console.error("Invalid date:", order.deliveryDate);
            return;
          }

          const weekStart = startOfWeek(deliveryDate, { weekStartsOn: 2 }); // Tuesday
          const weekKey = format(weekStart, "yyyy-MM-dd");

          if (!groups[weekKey]) {
            groups[weekKey] = [];
          }
          groups[weekKey].push(order);
        } catch (e) {
          console.error("Error parsing date:", e, "for order:", order.deliveryDate);
        }
      }
    });

    // Sort weeks by date (newest first)
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((weekKey) => ({
        weekStart: weekKey,
        orders: groups[weekKey].sort((a, b) => {
          const dateA = new Date(a.deliveryDate || a.pickupDate).getTime();
          const dateB = new Date(b.deliveryDate || b.pickupDate).getTime();
          return dateB - dateA; // Newest first
        }),
      }));
  }, [paginatedOrders]);

  const exportWeekToExcel = async (week: any, weekStartDate: Date, weekEndDate: Date) => {
    try {
      // Get the first order to determine driver/truck info
      const firstOrder = week.orders[0];
      if (!firstOrder) {
        toast.error("No orders to export");
        return;
      }

      // Fetch driver and company info
      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select(
          "name, company_id, company_name, agreement_start_date, weekly_payment, weeks_count, companies!drivers_company_id_fkey(name)",
        )
        .eq("id", firstOrder.driver1Id)
        .single();

      if (driverError) {
        console.error("Error fetching driver:", driverError);
      }

      const companyName = driver?.companies?.name || "";

      // Only use template for BF Prime United LLC
      if (companyName === "BF Prime United LLC") {
        await exportBFPrimeTemplate(week, weekStartDate, weekEndDate, firstOrder, driver);
      } else {
        // Use the old export method for other companies
        exportGenericExcel(week, weekStartDate, weekEndDate);
      }

      // Mark this week as exported in the database
      const { data: user } = await supabase.auth.getUser();
      const weekKey = `${format(weekStartDate, "yyyy-MM-dd")}_${format(weekEndDate, "yyyy-MM-dd")}`;
      
      await supabase.from("exported_weeks").upsert({
        week_start_date: format(weekStartDate, "yyyy-MM-dd"),
        week_end_date: format(weekEndDate, "yyyy-MM-dd"),
        exported_by: user.user?.id,
      }, {
        onConflict: 'week_start_date,week_end_date'
      });

      // Update local state
      setExportedWeeks(prev => new Set(prev).add(weekKey));
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Failed to export to Excel");
    }
  };

  const exportBFPrimeTemplate = async (
    week: any,
    weekStartDate: Date,
    weekEndDate: Date,
    firstOrder: any,
    driver: any,
  ) => {
    try {
      // Load the template
      const response = await fetch("/templates/BF_Prime_UNITED_template.xlsx");
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error("Template worksheet not found");
      }

      // Set row 12 to auto-fit (fit to data)
      worksheet.getRow(12).height = undefined; // Auto-fit

      // Fetch and update invoice number from database
      const { data: configData, error: configError } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("statement_type", "bf_prime_united")
        .single();

      if (configError) {
        console.error("Error fetching invoice config:", configError);
        throw new Error("Failed to fetch invoice configuration");
      }

      let invoiceNumber = configData.current_number;

      // Calculate the Monday of the week for weekStartDate
      const currentMonday = startOfWeek(weekStartDate, { weekStartsOn: 1 });
      const lastMonday = new Date(configData.last_monday);

      // If it's a new week (different Monday), increment the invoice number
      if (currentMonday.getTime() !== lastMonday.getTime()) {
        invoiceNumber = configData.current_number + 1;

        // Update the database with new invoice number and Monday date
        const { error: updateError } = await supabase
          .from("invoice_number_config")
          .update({
            current_number: invoiceNumber,
            last_monday: format(currentMonday, "yyyy-MM-dd"),
          })
          .eq("statement_type", "bf_prime_united");

        if (updateError) {
          console.error("Error updating invoice config:", updateError);
          throw new Error("Failed to update invoice configuration");
        }
      }

      // Find Thursday in the date range
      let thursdayDate = weekStartDate;
      for (let i = 0; i < 7; i++) {
        const checkDate = addDays(weekStartDate, i);
        if (getDay(checkDate) === 4) {
          // Thursday is day 4
          thursdayDate = checkDate;
          break;
        }
      }

      // Fill in header information
      worksheet.getCell("C2").value = invoiceNumber; // Trips invoice number
      worksheet.getCell("B3").value = format(thursdayDate, "M/d/yyyy"); // Thursday date (moved down 2)
      worksheet.getCell("B8").value = driver?.company_name || ""; // Company name from driver
      worksheet.getCell("F7").value = driver?.agreement_start_date
        ? format(new Date(driver.agreement_start_date), "M/d/yyyy")
        : ""; // Agreement start date

      // Weekly payment and weeks count in F9
      if (driver?.weekly_payment && driver?.weeks_count) {
        worksheet.getCell("F9").value = `$${driver.weekly_payment}/${driver.weeks_count}weeks`;
      }
      worksheet.getCell("C4").value = `${format(weekStartDate, "M/d/yyyy")}-${format(weekEndDate, "M/d/yyyy")}`; // Date range (moved down 2)
      worksheet.getCell("B7").value = driver?.name || firstOrder.driverName || ""; // Driver name (moved down 1)
      worksheet.getCell("F8").value = firstOrder.truckNumber || ""; // Truck number (moved down 1)

      // Clear the trip rows (rows 13-19) by directly setting values to null
      for (let row = 13; row <= 19; row++) {
        worksheet.getCell(`A${row}`).value = null;
        worksheet.getCell(`B${row}`).value = null;
        worksheet.getCell(`C${row}`).value = null;
        worksheet.getCell(`D${row}`).value = null;
        worksheet.getCell(`E${row}`).value = null;
        worksheet.getCell(`F${row}`).value = null;
        worksheet.getCell(`G${row}`).value = null;
        worksheet.getCell(`H${row}`).value = null;
        worksheet.getCell(`I${row}`).value = null;
      }

      // Fill in trip details starting at row 13
      let currentRow = 13;

      week.orders.forEach((order: any) => {
        worksheet.getCell(`A${currentRow}`).value = order.internalLoadNumber || "";
        worksheet.getCell(`B${currentRow}`).value = formatDateDisplay(order.pickupDate);
        worksheet.getCell(`C${currentRow}`).value = order.pickupCity || "";
        worksheet.getCell(`D${currentRow}`).value = order.pickupState || "";
        worksheet.getCell(`E${currentRow}`).value = formatDateDisplay(order.deliveryDate);
        worksheet.getCell(`F${currentRow}`).value = order.deliveryCity || "";
        worksheet.getCell(`G${currentRow}`).value = order.deliveryState || "";
        worksheet.getCell(`H${currentRow}`).value = order.mileage || 0;

        const driverPay = order.totalDriverPay || 0;

        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = driverPay;
        cellI.numFmt = "$#,##0.00";

        currentRow++;
      });

      // Add fixed deductions
      const endDateFormatted = format(weekEndDate, "M/d/yyyy");
      const deductions = [
        { row: 39, description: "Cargo Insurance", amount: 285.0 },
        { row: 40, description: "Trailer + Insurance", amount: 285.0 },
        { row: 41, description: "ELD", amount: 50.0 },
        { row: 42, description: "Pre-Pass", amount: 20.0 },
        { row: 43, description: "Truck Insurance", amount: 195.0 },
        { row: 44, description: "Truck Payment" },
      ];

      deductions.forEach(({ row, description, amount }) => {
        const cellB = worksheet.getCell(`B${row}`);
        cellB.value = description;
        cellB.font = { size: 16 };
        worksheet.getCell(`I${row}`).value = endDateFormatted;
        if (amount !== undefined) {
          const cellJ = worksheet.getCell(`J${row}`);
          cellJ.value = amount;
          cellJ.numFmt = "$#,##0.00";
        }
      });

      // Set E44: Calculate weeks passed from agreement_start_date
      if (driver?.agreement_start_date && driver?.weeks_count) {
        const startDate = new Date(driver.agreement_start_date);
        const currentDate = new Date();
        const weeksPassed = Math.floor((currentDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

        const e44Cell = worksheet.getCell("E44");
        e44Cell.value = `${weeksPassed}/${driver.weeks_count}`;
        e44Cell.font = { bold: true, size: 16 };
      }

      // Set J44 (truck payment deduction) to weekly_payment
      if (driver?.weekly_payment) {
        const j44Cell = worksheet.getCell("J44");
        j44Cell.value = driver.weekly_payment;
        j44Cell.numFmt = "$#,##0.00";
      }

      // Generate filename
      const weekRange = `${format(weekStartDate, "MMM-d")}-${format(weekEndDate, "MMM-d-yyyy")}`;
      const driverName = driver?.name || firstOrder?.driverName || "";
      const driverInfo = driverName && typeof driverName === "string" ? `_${driverName.replace(/\s+/g, "-")}` : "";
      const filename = `BF_Prime_${weekRange}${driverInfo}.xlsx`;

      // Save file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      toast.success(`Exported ${week.orders.length} trips to Excel`);
    } catch (error) {
      console.error("Error exporting BF Prime template:", error);
      toast.error("Failed to export to Excel");
    }
  };

  const exportGenericExcel = (week: any, weekStartDate: Date, weekEndDate: Date) => {
    try {
      // Prepare data for Excel
      const excelData = week.orders.map((order: any) => ({
        "Truck #": order.truckNumber || "",
        "Load #": order.internalLoadNumber || "",
        "Pickup Date": formatDateDisplay(order.pickupDate),
        "Pickup City": order.pickupCity || "",
        "Pickup State": order.pickupState || "",
        "Delivery Date": formatDateDisplay(order.deliveryDate),
        "Delivery City": order.deliveryCity || "",
        "Delivery State": order.deliveryState || "",
        Miles: order.mileage || 0,
        "Driver Pay": order.totalDriverPay || 0,
        Driver: order.driverName || "",
        "Broker Name": order.brokerName || "",
        "Broker Load #": order.brokerLoadNumber || "",
        Invoiced: order.invoiced || "",
        "Freight Amount": order.totalFreightAmount || 0,
      }));

      // Calculate totals
      const totals = {
        "Truck #": "",
        "Load #": "",
        "Pickup Date": "",
        "Pickup City": "",
        "Pickup State": "",
        "Delivery Date": "",
        "Delivery City": "",
        "Delivery State": "TOTALS:",
        Miles: week.orders.reduce((acc: number, o: any) => acc + (o.mileage || 0), 0),
        "Driver Pay": week.orders.reduce((acc: number, o: any) => acc + (o.totalDriverPay || 0), 0),
        Driver: "",
        "Broker Name": "",
        "Broker Load #": "",
        Invoiced: "",
        "Freight Amount": week.orders.reduce((acc: number, o: any) => acc + (o.totalFreightAmount || 0), 0),
      };

      // Add totals row
      excelData.push(totals);

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      ws["!cols"] = [
        { wch: 10 }, // Truck #
        { wch: 10 }, // Load #
        { wch: 12 }, // Pickup Date
        { wch: 20 }, // Pickup City
        { wch: 12 }, // Pickup State
        { wch: 12 }, // Delivery Date
        { wch: 20 }, // Delivery City
        { wch: 12 }, // Delivery State
        { wch: 10 }, // Miles
        { wch: 12 }, // Driver Pay
        { wch: 25 }, // Driver
        { wch: 25 }, // Broker Name
        { wch: 15 }, // Broker Load #
        { wch: 10 }, // Invoiced
        { wch: 15 }, // Freight Amount
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Trips");

      // Generate filename
      const weekRange = `${format(weekStartDate, "MMM-d")}-${format(weekEndDate, "MMM-d-yyyy")}`;
      const truckInfo = truckFilter ? `_Truck-${truckFilter}` : "";
      const filename = `Trips_Week_${weekRange}${truckInfo}.xlsx`;

      // Save file
      XLSX.writeFile(wb, filename);

      toast.success(`Exported ${week.orders.length} trips to Excel`);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Failed to export to Excel");
    }
  };

  const renderPaginationItems = () => {
    const items = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      items.push(
        <PaginationItem key="1">
          <PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink>
        </PaginationItem>,
      );
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>,
        );
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink onClick={() => setCurrentPage(i)} isActive={currentPage === i}>
            {i}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>,
        );
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink>
        </PaginationItem>,
      );
    }

    return items;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-6 w-64 bg-muted animate-pulse rounded" />
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="h-20 bg-muted animate-pulse rounded" />
                <div className="h-20 bg-muted animate-pulse rounded" />
                <div className="h-20 bg-muted animate-pulse rounded" />
                <div className="h-20 bg-muted animate-pulse rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Trips</h1>
      </div>

      <Card className="bg-background">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Truck Filter */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by truck number..."
                value={truckFilter}
                onChange={(e) => {
                  setTruckFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8"
              />
            </div>

            {/* Driver Filter */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by driver name..."
                value={driverFilter}
                onChange={(e) => {
                  setDriverFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-fit min-w-full">
        <CardHeader>
          <CardTitle>
            Trips ({filteredOrders.length} total, showing {startIndex + 1}-{Math.min(endIndex, filteredOrders.length)})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6 relative">
            <Table>
              <TableHeader className="sticky top-0 z-20">
                <TableRow className="bg-yellow-200 dark:bg-yellow-800 border-b-4 border-transparent">
                  <TableHead className="w-20 bg-yellow-200 dark:bg-yellow-800">Truck#</TableHead>
                  <TableHead className="w-32 bg-yellow-200 dark:bg-yellow-800">Driver</TableHead>
                  <TableHead className="w-20 bg-yellow-200 dark:bg-yellow-800">Load#</TableHead>
                  <TableHead className="w-32 bg-yellow-200 dark:bg-yellow-800">Pickup Date</TableHead>
                  <TableHead className="w-28 bg-yellow-200 dark:bg-yellow-800">Pickup City</TableHead>
                  <TableHead className="w-20 bg-yellow-200 dark:bg-yellow-800">Pickup State</TableHead>
                  <TableHead className="w-32 bg-yellow-200 dark:bg-yellow-800">Delivery Date</TableHead>
                  <TableHead className="w-28 bg-yellow-200 dark:bg-yellow-800">Delivery City</TableHead>
                  <TableHead className="w-20 bg-yellow-200 dark:bg-yellow-800">Delivery State</TableHead>
                  <TableHead className="w-16 bg-yellow-200 dark:bg-yellow-800">Miles</TableHead>
                  <TableHead className="w-36 bg-yellow-200 dark:bg-yellow-800">Broker Name</TableHead>
                  <TableHead className="w-28 bg-yellow-200 dark:bg-yellow-800">Broker Load#</TableHead>
                  <TableHead className="w-28 bg-yellow-200 dark:bg-yellow-800">Booked By</TableHead>
                  <TableHead className="w-24 bg-yellow-200 dark:bg-yellow-800">Driver Pay</TableHead>
                  <TableHead className="w-28 bg-yellow-200 dark:bg-yellow-800">Freight Amount</TableHead>
                  <TableHead className="w-20 bg-yellow-200 dark:bg-yellow-800">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByWeek.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
                      No trips found
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedByWeek.map((week, weekIndex) => {
                    const weekTotal = week.orders.reduce(
                      (acc, order) => ({
                        miles: acc.miles + (order.mileage || 0),
                        driverPay: acc.driverPay + (order.totalDriverPay || 0),
                        freightAmount: acc.freightAmount + (order.totalFreightAmount || 0),
                      }),
                      { miles: 0, driverPay: 0, freightAmount: 0 },
                    );

                    const weekStartDate = parseISO(week.weekStart);
                    const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 2 });
                    const weekKey = `${format(weekStartDate, "yyyy-MM-dd")}_${format(weekEndDate, "yyyy-MM-dd")}`;
                    const isExported = exportedWeeks.has(weekKey);

                    return (
                      <>
                        {/* Weekly Summary Row - Now appears FIRST */}
                        <TableRow
                          key={`week-${week.weekStart}`}
                          className={`font-semibold border-4 border-primary ${
                            isExported ? "bg-primary text-primary-foreground" : "bg-muted/50"
                          }`}
                        >
                          <TableCell colSpan={9} className="py-3">
                            Week: {format(weekStartDate, "MMM d")} - {format(weekEndDate, "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="py-3">{weekTotal.miles.toLocaleString()}</TableCell>
                          <TableCell colSpan={3} className="py-3"></TableCell>
                          <TableCell className="py-3">
                            <div className={`font-semibold ${
                              isExported ? "" : "text-green-600 dark:text-green-400"
                            }`}>
                              {formatCurrency(weekTotal.driverPay)}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className={`font-semibold ${
                              isExported ? "" : "text-green-600 dark:text-green-400"
                            }`}>
                              {formatCurrency(weekTotal.freightAmount)}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => exportWeekToExcel(week, weekStartDate, weekEndDate)}
                              title="Export week to Excel"
                            >
                              <FileDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Orders for this week */}
                        {week.orders.map((order, orderIndex) => {
                          // Background color rules - Recovery orders get purple background that overrides all other colors
                          const isRecovery = order.isRecovery;

                          const hasRedFees =
                            (order as any).lateFeeDriver > 0 ||
                            (order as any).noTrackingFeeDriver > 0 ||
                            (order as any).wrongAddressFeeDriver > 0;

                          const hasGreenFees = (order as any).detentionDriver > 0 || (order as any).layoverDriver > 0;

                          const hasYellowFees = (order as any).escortFee > 0 || (order as any).lumper > 0;

                          const hasOrangeCondition =
                            order.canceled ||
                            ((order as any).dateChangeNotes && (order as any).dateChangeNotes.trim() !== "");

                          const rowClassName = isRecovery
                            ? "bg-[hsl(270_50%_90%)] dark:bg-[hsl(270_50%_25%)] hover:bg-[hsl(270_50%_85%)] dark:hover:bg-[hsl(270_50%_30%)]"
                            : hasRedFees
                              ? "bg-[hsl(0_84%_90%)] dark:bg-[hsl(0_62%_25%)] hover:bg-[hsl(0_84%_85%)] dark:hover:bg-[hsl(0_62%_30%)]"
                              : hasGreenFees
                                ? "bg-[hsl(120_60%_90%)] dark:bg-[hsl(120_40%_25%)] hover:bg-[hsl(120_60%_85%)] dark:hover:bg-[hsl(120_40%_30%)]"
                                : hasYellowFees
                                  ? "bg-[hsl(45_93%_90%)] dark:bg-[hsl(45_93%_30%)] hover:bg-[hsl(45_93%_85%)] dark:hover:bg-[hsl(45_93%_35%)]"
                                  : hasOrangeCondition
                                    ? "bg-[hsl(25_95%_90%)] dark:bg-[hsl(25_75%_30%)] hover:bg-[hsl(25_95%_85%)] dark:hover:bg-[hsl(25_75%_35%)]"
                                    : orderIndex % 2 === 0
                                      ? "bg-background"
                                      : "bg-muted/30";

                          return (
                            <TableRow key={order.id} className={`h-16 ${rowClassName}`}>
                              <TableCell className="font-medium">
                                <div className="line-clamp-2">{order.truckNumber}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.driverName}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.internalLoadNumber}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{formatDateDisplay(order.pickupDate)}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.pickupCity}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.pickupState}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{formatDateDisplay(order.deliveryDate)}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.deliveryCity}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.deliveryState}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.mileage?.toLocaleString() || "0"}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.brokerName}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.brokerLoadNumber}</div>
                              </TableCell>
                              <TableCell>
                                <div className="line-clamp-2">{order.bookedBy}</div>
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-green-600 dark:text-green-400 line-clamp-2">
                                  {formatCurrency(order.totalDriverPay)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-green-600 dark:text-green-400 line-clamp-2">
                                  {formatCurrency(order.totalFreightAmount)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    localStorage.setItem("returnToTrips", "true");
                                    navigate(`/edit-order/${order.id}`);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {renderPaginationItems()}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Trips;
