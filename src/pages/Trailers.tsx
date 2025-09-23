import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit } from "lucide-react";

const trailers = [
  {
    id: 1,
    trailerNumber: "TRL-001",
    connectedTruck: "TRK-001"
  },
  {
    id: 2,
    trailerNumber: "TRL-002",
    connectedTruck: "TRK-002"
  },
  {
    id: 3,
    trailerNumber: "TRL-003",
    connectedTruck: "TRK-003"
  },
  {
    id: 4,
    trailerNumber: "TRL-004",
    connectedTruck: null
  }
];

const Trailers = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Trailers</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Trailer
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Trailer Inventory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search trailers..."
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trailer #</TableHead>
                <TableHead>Connected Truck #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trailers.map((trailer) => (
                <TableRow key={trailer.id}>
                  <TableCell className="font-medium">{trailer.trailerNumber}</TableCell>
                  <TableCell>{trailer.connectedTruck || "—"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      trailer.connectedTruck 
                        ? "bg-success/10 text-success" 
                        : "bg-warning/10 text-warning"
                    }`}>
                      {trailer.connectedTruck ? "In Use" : "Available"}
                    </span>
                  </TableCell>
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

export default Trailers;