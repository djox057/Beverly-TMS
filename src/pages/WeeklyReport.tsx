import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download } from "lucide-react";

const weeklyData = [
  {
    truckNumber: "TRK-001",
    data: {
      "28-Apr": { ptLoad: "PT-001", load: "LD-001", emptyMiles: 0, loadedMiles: 450, gross: 2500, driver: 1250, cut: 1250 },
      "29-Apr": { ptLoad: "PT-002", load: "LD-002", emptyMiles: 50, loadedMiles: 475, gross: 2800, driver: 1400, cut: 1400 },
      "30-Apr": { ptLoad: "", load: "", emptyMiles: 200, loadedMiles: 0, gross: 0, driver: 0, cut: 0 },
      "1-May": { ptLoad: "PT-003", load: "LD-003", emptyMiles: 0, loadedMiles: 380, gross: 2200, driver: 1100, cut: 1100 },
      "2-May": { ptLoad: "PT-004", load: "LD-004", emptyMiles: 25, loadedMiles: 520, gross: 3000, driver: 1500, cut: 1500 },
      "3-May": { ptLoad: "", load: "", emptyMiles: 150, loadedMiles: 0, gross: 0, driver: 0, cut: 0 },
      "4-May": { ptLoad: "", load: "", emptyMiles: 100, loadedMiles: 0, gross: 0, driver: 0, cut: 0 },
    }
  },
  {
    truckNumber: "TRK-002",
    data: {
      "28-Apr": { ptLoad: "PT-005", load: "LD-005", emptyMiles: 75, loadedMiles: 620, gross: 3200, driver: 1600, cut: 1600 },
      "29-Apr": { ptLoad: "", load: "", emptyMiles: 180, loadedMiles: 0, gross: 0, driver: 0, cut: 0 },
      "30-Apr": { ptLoad: "PT-006", load: "LD-006", emptyMiles: 0, loadedMiles: 390, gross: 2300, driver: 1150, cut: 1150 },
      "1-May": { ptLoad: "PT-007", load: "LD-007", emptyMiles: 30, loadedMiles: 580, gross: 3100, driver: 1550, cut: 1550 },
      "2-May": { ptLoad: "", load: "", emptyMiles: 120, loadedMiles: 0, gross: 0, driver: 0, cut: 0 },
      "3-May": { ptLoad: "PT-008", load: "LD-008", emptyMiles: 0, loadedMiles: 440, gross: 2600, driver: 1300, cut: 1300 },
      "4-May": { ptLoad: "", load: "", emptyMiles: 200, loadedMiles: 0, gross: 0, driver: 0, cut: 0 },
    }
  }
];

const dateHeaders = ["28-Apr", "29-Apr", "30-Apr", "1-May", "2-May", "3-May", "4-May"];
const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const calculateTotals = (truck: any) => {
  let totalEmpty = 0;
  let totalLoaded = 0;
  let totalGross = 0;
  let totalDriver = 0;
  let totalCut = 0;

  dateHeaders.forEach(date => {
    const dayData = truck.data[date];
    totalEmpty += dayData.emptyMiles;
    totalLoaded += dayData.loadedMiles;
    totalGross += dayData.gross;
    totalDriver += dayData.driver;
    totalCut += dayData.cut;
  });

  const totalMiles = totalEmpty + totalLoaded;
  const driverPerMile = totalMiles > 0 ? totalDriver / totalMiles : 0;
  const totalPerMile = totalMiles > 0 ? totalGross / totalMiles : 0;

  return {
    totalEmpty,
    totalLoaded,
    totalMiles,
    totalGross,
    totalDriver,
    totalCut,
    driverPerMile,
    totalPerMile
  };
};

const WeeklyReport = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Dispatcher Weekly Report</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select defaultValue="current-week">
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-week">April 28 - May 4, 2024</SelectItem>
                <SelectItem value="last-week">April 21 - April 27, 2024</SelectItem>
                <SelectItem value="two-weeks-ago">April 14 - April 20, 2024</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {weeklyData.map((truck) => {
        const totals = calculateTotals(truck);
        
        return (
          <Card key={truck.truckNumber}>
            <CardHeader>
              <CardTitle className="text-lg">Truck {truck.truckNumber}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Date</TableHead>
                      {dateHeaders.map((date, index) => (
                        <TableHead key={date} className="text-center min-w-24">
                          <div>{date}</div>
                          <div className="text-xs text-muted-foreground">{dayHeaders[index]}</div>
                        </TableHead>
                      ))}
                      <TableHead className="text-center min-w-24 font-semibold">TOTAL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Truck#</TableCell>
                      {dateHeaders.map(date => (
                        <TableCell key={date} className="text-center">{truck.truckNumber}</TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">{truck.truckNumber}</TableCell>
                    </TableRow>
                    
                    <TableRow>
                      <TableCell className="font-medium">PT Load#</TableCell>
                      {dateHeaders.map(date => (
                        <TableCell key={date} className="text-center">{truck.data[date].ptLoad}</TableCell>
                      ))}
                      <TableCell className="text-center">—</TableCell>
                    </TableRow>
                    
                    <TableRow>
                      <TableCell className="font-medium">Load#</TableCell>
                      {dateHeaders.map(date => (
                        <TableCell key={date} className="text-center">{truck.data[date].load}</TableCell>
                      ))}
                      <TableCell className="text-center">—</TableCell>
                    </TableRow>
                    
                    <TableRow>
                      <TableCell className="font-medium">Empty mls</TableCell>
                      {dateHeaders.map(date => (
                        <TableCell key={date} className="text-center">{truck.data[date].emptyMiles || "—"}</TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">{totals.totalEmpty}</TableCell>
                    </TableRow>
                    
                    <TableRow>
                      <TableCell className="font-medium">Loaded mls</TableCell>
                      {dateHeaders.map(date => (
                        <TableCell key={date} className="text-center">{truck.data[date].loadedMiles || "—"}</TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">
                        <div>{totals.totalLoaded}</div>
                        <div className="text-xs text-muted-foreground">TOTAL MILES</div>
                      </TableCell>
                    </TableRow>
                    
                    <TableRow className="bg-muted/50">
                      <TableCell className="font-medium">Total Miles</TableCell>
                      {dateHeaders.map(date => {
                        const total = truck.data[date].emptyMiles + truck.data[date].loadedMiles;
                        return (
                          <TableCell key={date} className="text-center font-medium">
                            {total || "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-bold text-primary">
                        <div>{totals.totalMiles}</div>
                        <div className="text-xs">driver per mile</div>
                      </TableCell>
                    </TableRow>
                    
                    <TableRow>
                      <TableCell className="font-medium">Gross</TableCell>
                      {dateHeaders.map(date => (
                        <TableCell key={date} className="text-center">
                          {truck.data[date].gross ? `$${truck.data[date].gross.toLocaleString()}` : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold text-success">
                        ${totals.totalGross.toLocaleString()}
                      </TableCell>
                    </TableRow>
                    
                    <TableRow>
                      <TableCell className="font-medium">Driver</TableCell>
                      {dateHeaders.map(date => (
                        <TableCell key={date} className="text-center">
                          {truck.data[date].driver ? `$${truck.data[date].driver.toLocaleString()}` : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">
                        <div>${totals.totalDriver.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">total per mile</div>
                      </TableCell>
                    </TableRow>
                    
                    <TableRow>
                      <TableCell className="font-medium">Cut</TableCell>
                      {dateHeaders.map(date => (
                        <TableCell key={date} className="text-center">
                          {truck.data[date].cut ? `$${truck.data[date].cut.toLocaleString()}` : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold text-accent">
                        <div>${totals.totalCut.toLocaleString()}</div>
                        <div className="text-xs">${totals.totalPerMile.toFixed(2)}</div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              
              <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Miles</div>
                    <div className="font-semibold">{totals.totalMiles.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Driver Per Mile</div>
                    <div className="font-semibold">${totals.driverPerMile.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Per Mile</div>
                    <div className="font-semibold">${totals.totalPerMile.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Net Profit</div>
                    <div className="font-semibold text-success">${totals.totalCut.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default WeeklyReport;