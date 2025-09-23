import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit, Phone, Mail } from "lucide-react";

const drivers = [
  {
    id: 1,
    name: "John Smith",
    truckNumber: "TRK-001",
    trailerNumber: "TRL-001",
    phone: "(555) 123-4567",
    email: "john.smith@company.com",
    homeLocation: "Chicago, IL",
    coordinates: "41.8781, -87.6298"
  },
  {
    id: 2,
    name: "Mike Johnson",
    truckNumber: "TRK-001",
    trailerNumber: "TRL-001",
    phone: "(555) 234-5678",
    email: "mike.johnson@company.com",
    homeLocation: "Dallas, TX",
    coordinates: "32.7767, -96.7970"
  },
  {
    id: 3,
    name: "David Wilson",
    truckNumber: "TRK-002",
    trailerNumber: "TRL-002",
    phone: "(555) 345-6789",
    email: "david.wilson@company.com",
    homeLocation: "Denver, CO",
    coordinates: "39.7392, -104.9903"
  },
  {
    id: 4,
    name: "Robert Brown",
    truckNumber: "TRK-003",
    trailerNumber: "TRL-003",
    phone: "(555) 456-7890",
    email: "robert.brown@company.com",
    homeLocation: "Phoenix, AZ",
    coordinates: "33.4484, -112.0740"
  }
];

const Drivers = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Drivers</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Driver
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Driver Directory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search drivers..."
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Truck #</TableHead>
                <TableHead>Trailer #</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Home Location</TableHead>
                <TableHead>Coordinates</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell className="font-medium">{driver.name}</TableCell>
                  <TableCell>{driver.truckNumber}</TableCell>
                  <TableCell>{driver.trailerNumber}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {driver.phone}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {driver.email}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{driver.homeLocation}</TableCell>
                  <TableCell className="font-mono text-xs">{driver.coordinates}</TableCell>
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

export default Drivers;