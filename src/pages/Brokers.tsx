import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit, Building } from "lucide-react";

const brokers = [
  {
    id: 1,
    name: "ABC Logistics",
    mcNumber: "MC-123456",
    address: "123 Main St, Chicago, IL 60601",
    contact: "John Doe",
    phone: "(555) 987-6543",
    email: "dispatch@abclogistics.com"
  },
  {
    id: 2,
    name: "XYZ Transport",
    mcNumber: "MC-789012",
    address: "456 Oak Ave, Dallas, TX 75201",
    contact: "Jane Smith",
    phone: "(555) 876-5432",
    email: "ops@xyztransport.com"
  },
  {
    id: 3,
    name: "QuickMove Inc",
    mcNumber: "MC-345678",
    address: "789 Pine Rd, Denver, CO 80202",
    contact: "Bob Johnson",
    phone: "(555) 765-4321",
    email: "loads@quickmove.com"
  },
  {
    id: 4,
    name: "Freight Masters",
    mcNumber: "MC-901234",
    address: "321 Elm St, Phoenix, AZ 85001",
    contact: "Lisa Wilson",
    phone: "(555) 654-3210",
    email: "dispatch@freightmasters.com"
  }
];

const Brokers = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Brokers</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Broker
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Broker Directory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search brokers..."
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>MC Number</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brokers.map((broker) => (
                <TableRow key={broker.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{broker.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{broker.mcNumber}</TableCell>
                  <TableCell className="max-w-xs">{broker.address}</TableCell>
                  <TableCell>{broker.contact}</TableCell>
                  <TableCell>{broker.phone}</TableCell>
                  <TableCell>{broker.email}</TableCell>
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

export default Brokers;