import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Fuel, Upload, Loader2, Droplets, DollarSign, FileText, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useFuelTransactions, getDefaultDateRange, FuelTransactionInsert, FuelFilters } from "@/hooks/useFuelTransactions";
import { format, parse } from "date-fns";
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
import { useToast } from "@/hooks/use-toast";

const COMPANIES = [
  { id: "bf_prime", label: "BF Prime" },
  { id: "bf_prime_united", label: "BF Prime United" },
  { id: "beverly_freight", label: "Beverly Freight" },
  { id: "bg_prime_inc", label: "BG Prime Inc" },
  { id: "beverly_group_drivers", label: "Beverly Group Drivers" },
];

const ITEMS_PER_PAGE = 20;

const FuelReports = () => {
  const { toast } = useToast();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingCompany, setUploadingCompany] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [dragOver, setDragOver] = useState(false);

  const [filters, setFilters] = useState<FuelFilters>({
    startDate: null,
    endDate: null,
    truckNumber: "",
    driverName: "",
    itemType: "ALL",
  });

  const {
    transactions,
    isLoading,
    truckNumbers,
    driverNames,
    itemTypes,
    summary,
    uploadTransactions,
    isUploading,
    deleteAll,
    isDeleting,
  } = useFuelTransactions(filters);

  // Pagination
  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filters change
  const handleFilterChange = (newFilters: FuelFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
    if (files.length === 0) {
      toast({
        title: "Invalid file",
        description: "Please drop CSV files only.",
        variant: "destructive",
      });
      return;
    }
    
    // Process each dropped file
    files.forEach(file => processFile(file, "drop"));
  };

  const processFile = (file: File, companyId: string) => {
    if (companyId !== "drop") {
      setUploadingCompany(companyId);
    }

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

        uploadTransactions(records, {
          onSettled: () => setUploadingCompany(null),
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, companyId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    processFile(file, companyId);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Fuel className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Fuel Reports</h1>
        </div>
        
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting || transactions.length === 0}>
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
                This will permanently delete all {transactions.length} fuel transactions. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteAll()}>Delete All</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Company Upload Buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Upload CSV by Company</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragOver 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <Upload className={`h-8 w-8 mx-auto mb-2 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
            <p className="text-sm text-muted-foreground">
              Drag and drop CSV files here, or use buttons below
            </p>
          </div>

          {/* Company Buttons */}
          <div className="flex flex-wrap gap-3">
            {COMPANIES.map((company) => (
              <div key={company.id}>
                <input
                  ref={(el) => (fileInputRefs.current[company.id] = el)}
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileUpload(e, company.id)}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRefs.current[company.id]?.click()}
                  disabled={isUploading}
                  className="min-w-[160px]"
                >
                  {uploadingCompany === company.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {company.label}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-5 gap-4">
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
              <Select
                value={filters.truckNumber || "ALL"}
                onValueChange={(value) =>
                  handleFilterChange({ ...filters, truckNumber: value === "ALL" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Trucks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Trucks</SelectItem>
                  {truckNumbers.map((truck) => (
                    <SelectItem key={truck} value={truck}>
                      {truck}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Driver</Label>
              <Select
                value={filters.driverName || "ALL"}
                onValueChange={(value) =>
                  handleFilterChange({ ...filters, driverName: value === "ALL" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Drivers</SelectItem>
                  {driverNames.map((driver) => (
                    <SelectItem key={driver} value={driver}>
                      {driver}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select
                value={filters.itemType}
                onValueChange={(value) => handleFilterChange({ ...filters, itemType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Items</SelectItem>
                  {itemTypes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          {transactions.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, transactions.length)} of {transactions.length}
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
                  {paginatedTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">{transaction.truck_number}</TableCell>
                      <TableCell>{transaction.driver_name}</TableCell>
                      <TableCell className="font-mono text-xs">{transaction.transaction_number}</TableCell>
                      <TableCell>
                        {format(new Date(transaction.transaction_date), "MM/dd/yyyy")}
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
    </div>
  );
};

export default FuelReports;
