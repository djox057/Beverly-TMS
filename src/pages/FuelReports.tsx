import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Fuel, Upload, Loader2, Droplets, DollarSign, FileText, Trash2, ChevronLeft, ChevronRight, MapPin, HelpCircle } from "lucide-react";
import { useFuelTransactions, getDefaultDateRange, FuelTransactionInsert, FuelFilters } from "@/hooks/useFuelTransactions";
import { useIftaRecords, IftaRecordInsert, generateQuarterOptions, IftaFilters } from "@/hooks/useIftaRecords";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFuelDriverMappings } from "@/hooks/useFuelDriverMappings";
import { FuelDriverMappingDialog } from "@/components/FuelDriverMappingDialog";
import { EfsMissingReceiptsPanel } from "@/components/EfsMissingReceiptsPanel";
import { useEfsMissingReceipts } from "@/hooks/useEfsMissingReceipts";
import { useLumperMissingRevisedRC } from "@/hooks/useLumperMissingRevisedRC";
import { format, parse } from "date-fns";
import { formatDateNoTimezone } from "@/lib/utils";
import Papa from "papaparse";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const COMPANIES = [
  { id: "bf_prime", label: "BF Prime" },
  { id: "bf_prime_united", label: "BF Prime United" },
  { id: "beverly_freight", label: "Beverly Freight" },
  { id: "bg_prime_inc", label: "BG Prime Inc" },
  { id: "beverly_group_drivers", label: "Beverly Group Drivers" },
  { id: "united_enterprise", label: "United Enterprise Solutions" },
  { id: "ap_silver_trans", label: "AP Silver Trans" },
];

// Page size is now controlled by the hook (server-side pagination)

const FuelReports = () => {
  const { toast } = useToast();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const iftaFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingCompany, setUploadingCompany] = useState<string | null>(null);
  const [uploadingIfta, setUploadingIfta] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [dragOverCompany, setDragOverCompany] = useState<string | null>(null);
  const [dragOverIfta, setDragOverIfta] = useState(false);
  const [togglePaidTransaction, setTogglePaidTransaction] = useState<{ id: string; currentPaid: boolean; driverName: string } | null>(null);
  const [activeTab, setActiveTab] = useState("fuel");

  const [filters, setFilters] = useState<FuelFilters>({
    startDate: null,
    endDate: null,
    truckNumber: "",
    driverName: "",
    itemType: "ALL",
    paymentType: "ALL",
  });

  const {
    transactions,
    totalCount,
    totalPages,
    pageSize,
    isLoading,
    truckNumbers,
    driverNames,
    itemTypes,
    summary,
    uploadTransactions,
    isUploading,
    deleteAll,
    isDeleting,
    togglePaid,
    isTogglingPaid,
  } = useFuelTransactions(filters, currentPage);

  const { unmatchedDrivers, refetchUnmatched } = useFuelDriverMappings();

  // IFTA quarter filter state
  const [iftaQuarter, setIftaQuarter] = useState<string | null>(null);
  const quarterOptions = generateQuarterOptions();
  
  // IFTA data - filter fuel gallons by quarter
  const {
    iftaRecords,
    isLoadingIfta,
    truckStateReport,
    uploadIftaRecords,
    isUploadingIfta,
    deleteAllIfta,
    isDeletingIfta,
  } = useIftaRecords({ ...filters, itemType: "ULSD" }, { quarter: iftaQuarter });

  // EFS missing data count for badge
  const { fuelRequests: efsMissingFuel } = useEfsMissingReceipts();
  const { lumperRequests: lumperMissingRC } = useLumperMissingRevisedRC();
  const efsMissingCount = efsMissingFuel.length + lumperMissingRC.length;

  // IFTA truck search filter
  const [iftaTruckSearch, setIftaTruckSearch] = useState("");
  
  const filteredTruckStateReport = truckStateReport.filter(truck =>
    truck.truckNumber.toLowerCase().includes(iftaTruckSearch.toLowerCase())
  );

  // Pagination is now server-side

  // Reset to page 1 when filters change
  const handleFilterChange = (newFilters: FuelFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleDragOver = (e: React.DragEvent, companyId: string) => {
    e.preventDefault();
    setDragOverCompany(companyId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCompany(null);
  };

  const handleDrop = (e: React.DragEvent, companyId: string, companyLabel: string) => {
    e.preventDefault();
    setDragOverCompany(null);
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
    if (files.length === 0) {
      toast({
        title: "Invalid file",
        description: "Please drop CSV files only.",
        variant: "destructive",
      });
      return;
    }
    
    // Process the first dropped file for this company
    processFile(files[0], companyId, companyLabel);
  };

  const processFile = (file: File, companyId: string, companyLabel: string) => {
    setUploadingCompany(companyId);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const records: FuelTransactionInsert[] = [];
        
        for (const row of results.data as Record<string, string>[]) {
          const truckNumber = row["Unit"]?.trim();
          const driverName = row["Driver Name"]?.trim();
          const transactionNumber = row["Invoice"]?.trim();
          const tranDateStr = row["Tran Date"]?.trim();
          const item = row["Item"]?.trim();

          if (!truckNumber || !driverName || !transactionNumber || !tranDateStr || !item) {
            continue;
          }

          let transactionDate: string;
          if (tranDateStr.includes("-")) {
            transactionDate = tranDateStr;
          } else {
            try {
              const parsedDate = parse(tranDateStr, "MM/dd/yyyy", new Date());
              transactionDate = format(parsedDate, "yyyy-MM-dd");
            } catch {
              console.warn(`Invalid date format: ${tranDateStr}`);
              continue;
            }
          }

          const stateValue = row["State/Prov"]?.trim() || row["State/ Prov"]?.trim() || null;

          records.push({
            truck_number: truckNumber,
            driver_name: driverName,
            transaction_number: transactionNumber,
            transaction_date: transactionDate,
            location_name: row["Location Name"]?.trim() || null,
            city: row["City"]?.trim() || null,
            state: stateValue,
            fees: parseFloat(row["Fees"]) || 0,
            item: item,
            unit_price: parseFloat(row["Unit Price"]) || 0,
            quantity: parseFloat(row["Qty"]) || 0,
            amount: parseFloat(row["Amt"]) || 0,
          });
        }

        if (records.length === 0) {
          toast({
            title: "No valid records",
            description: "The CSV file did not contain any valid fuel transactions.",
            variant: "destructive",
          });
          setUploadingCompany(null);
          return;
        }

        uploadTransactions({ records, company: companyLabel }, {
          onSettled: () => {
            setUploadingCompany(null);
            refetchUnmatched();
          },
        });
      },
      error: (error) => {
        toast({
          title: "Parse error",
          description: error.message,
          variant: "destructive",
        });
        setUploadingCompany(null);
      },
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, companyId: string, companyLabel: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    processFile(file, companyId, companyLabel);

    // Reset file input
    const ref = fileInputRefs.current[companyId];
    if (ref) {
      ref.value = "";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // IFTA file processing
  const processIftaFile = (file: File) => {
    setUploadingIfta(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const records: IftaRecordInsert[] = [];
        
        for (const row of results.data as Record<string, string>[]) {
          const vehicle = row["Vehicle"]?.trim();
          const fuelType = row["Fuel Type"]?.trim();
          const jurisdiction = row["Jurisdiction"]?.trim();
          const taxableMilesStr = row["Taxable Miles"]?.trim();
          const totalMilesStr = row["Total Miles"]?.trim();
          const taxPaidGallonsStr = row["Tax Paid Gallons"]?.trim();

          if (!vehicle || !jurisdiction) {
            continue;
          }

          records.push({
            vehicle,
            fuel_type: fuelType || "Unspecified",
            jurisdiction,
            taxable_miles: parseFloat(taxableMilesStr) || 0,
            total_miles: parseFloat(totalMilesStr) || 0,
            tax_paid_gallons: parseFloat(taxPaidGallonsStr) || 0,
          });
        }

        if (records.length === 0) {
          toast({
            title: "No valid records",
            description: "The CSV file did not contain any valid IFTA records.",
            variant: "destructive",
          });
          setUploadingIfta(false);
          return;
        }

        uploadIftaRecords(records, {
          onSettled: () => {
            setUploadingIfta(false);
          },
        });
      },
      error: (error) => {
        toast({
          title: "Parse error",
          description: error.message,
          variant: "destructive",
        });
        setUploadingIfta(false);
      },
    });
  };

  const handleIftaDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIfta(true);
  };

  const handleIftaDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIfta(false);
  };

  const handleIftaDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIfta(false);
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
    if (files.length === 0) {
      toast({
        title: "Invalid file",
        description: "Please drop CSV files only.",
        variant: "destructive",
      });
      return;
    }
    
    processIftaFile(files[0]);
  };

  const handleIftaFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    processIftaFile(file);

    if (iftaFileInputRef.current) {
      iftaFileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Fuel className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Fuel Reports</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <FuelDriverMappingDialog unmatchedCount={unmatchedDrivers.length} />
          
          {activeTab === "fuel" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting || totalCount === 0}>
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all fuel transactions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {totalCount} fuel transactions. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteAll()}>Delete All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          
          {activeTab === "ifta" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeletingIfta || iftaRecords.length === 0}>
                  {isDeletingIfta ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear IFTA
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all IFTA records?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {iftaRecords.length} IFTA records. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteAllIfta()}>Delete All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="fuel" className="flex items-center gap-2">
            <Fuel className="h-4 w-4" />
            Fuel Transactions
          </TabsTrigger>
          <TabsTrigger value="ifta" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            IFTA
          </TabsTrigger>
          <TabsTrigger value="efs-receipts" className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            EFS Data
            {efsMissingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-amber-500 text-white rounded-full">
                {efsMissingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fuel" className="space-y-6 mt-6">

      {/* Company Upload Zones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Upload CSV by Company (drag & drop or click)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-2">
            {COMPANIES.map((company) => (
              <div
                key={company.id}
                onDragOver={(e) => handleDragOver(e, company.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, company.id, company.label)}
                onClick={() => fileInputRefs.current[company.id]?.click()}
                className={`border-2 border-dashed rounded-md p-2 text-center transition-colors cursor-pointer ${
                  dragOverCompany === company.id
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
                } ${uploadingCompany === company.id ? "opacity-50" : ""}`}
              >
                <input
                  ref={(el) => (fileInputRefs.current[company.id] = el)}
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileUpload(e, company.id, company.label)}
                  className="hidden"
                />
                {uploadingCompany === company.id ? (
                  <Loader2 className="h-4 w-4 mx-auto mb-1 animate-spin text-primary" />
                ) : (
                  <Upload className={`h-4 w-4 mx-auto mb-1 ${dragOverCompany === company.id ? "text-primary" : "text-muted-foreground"}`} />
                )}
                <p className="text-xs font-medium truncate">{company.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <DateRangePicker
                date={{
                  from: filters.startDate || undefined,
                  to: filters.endDate || undefined,
                }}
                onDateChange={(range) =>
                  handleFilterChange({
                    ...filters,
                    startDate: range?.from || null,
                    endDate: range?.to || null,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Truck #</Label>
              <Combobox
                options={[
                  { value: "ALL", label: "All Trucks" },
                  ...truckNumbers.map((truck) => ({ value: truck, label: truck })),
                ]}
                value={filters.truckNumber || "ALL"}
                onValueChange={(value) =>
                  handleFilterChange({ ...filters, truckNumber: value === "ALL" ? "" : value })
                }
                placeholder="All Trucks"
                searchPlaceholder="Search trucks..."
              />
            </div>

            <div className="space-y-2">
              <Label>Driver</Label>
              <Combobox
                options={[
                  { value: "ALL", label: "All Drivers" },
                  ...driverNames.map((driver) => ({ value: driver, label: driver })),
                ]}
                value={filters.driverName || "ALL"}
                onValueChange={(value) =>
                  handleFilterChange({ ...filters, driverName: value === "ALL" ? "" : value })
                }
                placeholder="All Drivers"
                searchPlaceholder="Search drivers..."
              />
            </div>

            <div className="space-y-2">
              <Label>Item Type</Label>
              <Combobox
                options={[
                  { value: "ALL", label: "All Items" },
                  ...itemTypes.map((item) => ({ value: item, label: item })),
                ]}
                value={filters.itemType}
                onValueChange={(value) => handleFilterChange({ ...filters, itemType: value })}
                placeholder="All Items"
                searchPlaceholder="Search items..."
              />
            </div>

            <div className="space-y-2">
              <Label>Payment</Label>
              <Combobox
                options={[
                  { value: "ALL", label: "All" },
                  { value: "EFS", label: "EFS (App)" },
                  { value: "CARD", label: "Card" },
                ]}
                value={filters.paymentType}
                onValueChange={(value) => handleFilterChange({ ...filters, paymentType: value as "ALL" | "EFS" | "CARD" })}
                placeholder="All"
                searchPlaceholder="Search..."
              />
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  handleFilterChange({
                    ...getDefaultDateRange(),
                    truckNumber: "",
                    driverName: "",
                    itemType: "ALL",
                    paymentType: "ALL",
                  });
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Fuel className="h-4 w-4" />
              Diesel (ULSD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.dieselGallons)} gal</div>
            <p className="text-sm text-muted-foreground">{formatCurrency(summary.dieselAmount)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              DEF (DEFD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.defGallons)} gal</div>
            <p className="text-sm text-muted-foreground">{formatCurrency(summary.defAmount)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.feesTotal)}</div>
            <p className="text-sm text-muted-foreground">Service fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Other
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.otherAmount)}</div>
            <p className="text-sm text-muted-foreground">Scale, etc.</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Grand Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(summary.grandTotal)}</div>
            <p className="text-sm text-muted-foreground">{summary.transactionCount} transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transactions</CardTitle>
          {totalCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No fuel transactions found. Upload a CSV file to get started.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paid</TableHead>
                    <TableHead>Truck #</TableHead>
                    <TableHead>Driver Name</TableHead>
                    <TableHead>Transaction #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <button
                          onClick={() => setTogglePaidTransaction({
                            id: transaction.id,
                            currentPaid: transaction.paid,
                            driverName: transaction.driver_name,
                          })}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                            transaction.paid
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {transaction.paid ? "Yes" : "No"}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{transaction.truck_number}</TableCell>
                      <TableCell>{transaction.driver_name}</TableCell>
                      <TableCell className="font-mono text-xs">{transaction.transaction_number}</TableCell>
                      <TableCell>
                        {formatDateNoTimezone(transaction.transaction_date)}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={transaction.location_name || ""}>
                        {transaction.location_name || "-"}
                      </TableCell>
                      <TableCell>{transaction.city || "-"}</TableCell>
                      <TableCell>{transaction.state || "-"}</TableCell>
                      <TableCell className="text-right">
                        {transaction.fees > 0 ? formatCurrency(transaction.fees) : "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            transaction.item === "ULSD"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                              : transaction.item === "DEFD"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {transaction.item}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(transaction.unit_price)}</TableCell>
                      <TableCell className="text-right">{formatNumber(transaction.quantity)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        </Card>
        </TabsContent>

        {/* IFTA Tab */}
        <TabsContent value="ifta" className="space-y-6 mt-6">
          {/* IFTA Upload Zone */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Upload IFTA CSV (drag & drop or click)</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={handleIftaDragOver}
                onDragLeave={handleIftaDragLeave}
                onDrop={handleIftaDrop}
                onClick={() => iftaFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-md p-4 text-center transition-colors cursor-pointer ${
                  dragOverIfta
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
                } ${uploadingIfta ? "opacity-50" : ""}`}
              >
                <input
                  ref={iftaFileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleIftaFileUpload}
                  className="hidden"
                />
                {uploadingIfta || isUploadingIfta ? (
                  <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-primary" />
                ) : (
                  <Upload className={`h-6 w-6 mx-auto mb-2 ${dragOverIfta ? "text-primary" : "text-muted-foreground"}`} />
                )}
                <p className="text-sm font-medium">Drop IFTA CSV or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Expected columns: Vehicle, Fuel Type, Jurisdiction, Taxable Miles, Total Miles, Tax Paid Gallons
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {iftaRecords.length} IFTA records loaded
              </p>
            </CardContent>
          </Card>

          {/* Truck State Report */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Truck Miles & ULSD Gallons by State
                </CardTitle>
                <div className="flex items-center gap-3">
                  <Select
                    value={iftaQuarter || "all"}
                    onValueChange={(value) => setIftaQuarter(value === "all" ? null : value)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="All Quarters" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Quarters</SelectItem>
                      {quarterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    type="text"
                    placeholder="Search by truck..."
                    value={iftaTruckSearch}
                    onChange={(e) => setIftaTruckSearch(e.target.value)}
                    className="w-44 px-3 py-2 text-sm border rounded-md bg-background"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingIfta ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTruckStateReport.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {iftaTruckSearch ? "No trucks match your search." : "No data available. Upload IFTA and fuel transaction CSVs to see the report."}
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredTruckStateReport.map((truck) => (
                    <div key={truck.truckNumber} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-lg">Truck {truck.truckNumber}</h3>
                        <div className="text-right">
                          <p className="text-sm font-medium">Total: {formatNumber(truck.totalMiles, 1)} mi</p>
                          <p className="text-sm text-muted-foreground">{formatNumber(truck.totalUlsdGallons, 1)} gal ULSD</p>
                        </div>
                      </div>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>State</TableHead>
                              <TableHead className="text-right">Total Miles</TableHead>
                              <TableHead className="text-right">Taxable Miles</TableHead>
                              <TableHead className="text-right">ULSD Gallons</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {truck.states.map((state) => (
                              <TableRow key={state.state} className="border-b border-border">
                                <TableCell className="font-medium">{state.state}</TableCell>
                                <TableCell className="text-right">{formatNumber(state.totalMiles, 1)}</TableCell>
                                <TableCell className="text-right">{formatNumber(state.taxableMiles, 1)}</TableCell>
                                <TableCell className="text-right">{formatNumber(state.ulsdGallons, 1)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EFS Receipts Tab */}
        <TabsContent value="efs-receipts" className="space-y-6 mt-6">
          <EfsMissingReceiptsPanel />
        </TabsContent>
      </Tabs>

      {/* Toggle Paid Confirmation Dialog */}
      <AlertDialog open={!!togglePaidTransaction} onOpenChange={(open) => !open && setTogglePaidTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark as {togglePaidTransaction?.currentPaid ? "Unpaid" : "Paid"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this transaction for {togglePaidTransaction?.driverName} as {togglePaidTransaction?.currentPaid ? "unpaid" : "paid"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (togglePaidTransaction) {
                  togglePaid({
                    id: togglePaidTransaction.id,
                    paid: !togglePaidTransaction.currentPaid,
                  });
                  setTogglePaidTransaction(null);
                }
              }}
              disabled={isTogglingPaid}
            >
              {isTogglingPaid ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FuelReports;
