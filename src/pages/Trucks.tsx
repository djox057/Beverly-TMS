import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit } from "lucide-react";

const trucks = [
  {
    id: 1,
    truckNumber: "TRK-001",
    trailer: "TRL-001",
    driver1: "John Smith",
    driver2: "Mike Johnson",
    fleet: "Fleet A"
  },
  {
    id: 2,
    truckNumber: "TRK-002",
    trailer: "TRL-002",
    driver1: "David Wilson",
    driver2: null,
    fleet: "Fleet B"
  },
  {
    id: 3,
    truckNumber: "TRK-003",
    trailer: "TRL-003",
    driver1: "Robert Brown",
    driver2: "James Davis",
    fleet: "Fleet A"
  }
];

const Trucks = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Trucks</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Truck
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Truck Fleet</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search trucks..."
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Truck #</TableHead>
                <TableHead>Connected Trailer</TableHead>
                <TableHead>Driver 1</TableHead>
                <TableHead>Driver 2</TableHead>
                <TableHead>Fleet Assignment</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trucks.map((truck) => (
                <TableRow key={truck.id}>
                  <TableCell className="font-medium">{truck.truckNumber}</TableCell>
                  <TableCell>{truck.trailer}</TableCell>
                  <TableCell>{truck.driver1}</TableCell>
                  <TableCell>{truck.driver2 || "—"}</TableCell>
                  <TableCell>{truck.fleet}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Trucks;