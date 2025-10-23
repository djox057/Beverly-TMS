import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Truck, Package, User } from "lucide-react";
import { useExpiringTrucks, useExpiringTrailers, useExpiringDrivers } from "@/hooks/useExpiringAlerts";
import { useAuthContext } from "@/contexts/AuthContext";
import { format } from "date-fns";

const formatDate = (date: string | null) => {
  if (!date) return "N/A";
  return format(new Date(date), "MM/dd/yyyy");
};

const getExpirationStatus = (date: string | null) => {
  if (!date) return { variant: "secondary" as const, label: "No Date" };
  
  const expirationDate = new Date(date);
  const now = new Date();
  const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiration < 0) {
    return { variant: "destructive" as const, label: "Expired" };
  } else if (daysUntilExpiration <= 30) {
    return { variant: "destructive" as const, label: `${daysUntilExpiration} days` };
  } else {
    return { variant: "default" as const, label: `${daysUntilExpiration} days` };
  }
};

export default function Alerts() {
  const { data: trucks = [], isLoading: trucksLoading } = useExpiringTrucks();
  const { data: trailers = [], isLoading: trailersLoading } = useExpiringTrailers();
  const { data: drivers = [], isLoading: driversLoading } = useExpiringDrivers();
  const { hasRole } = useAuthContext();

  // Check if user has admin or safety role
  if (!hasRole('admin') && !hasRole('safety')) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">This page is only accessible to Admin and Safety roles.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <h1 className="text-3xl font-bold">Expiration Alerts</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Items Expiring Within 60 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="trucks" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="trucks" className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Trucks ({trucks.length})
              </TabsTrigger>
              <TabsTrigger value="trailers" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Trailers ({trailers.length})
              </TabsTrigger>
              <TabsTrigger value="drivers" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Drivers ({drivers.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trucks" className="mt-6">
              {trucksLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded">
                      <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : trucks.length === 0 ? (
                <p className="text-muted-foreground">No trucks with expiring documents.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Truck #</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>DOT Inspection</TableHead>
                      <TableHead>Plate Expiration</TableHead>
                      <TableHead>Insurance Expiration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trucks.map((truck) => (
                      <TableRow key={truck.id}>
                        <TableCell className="font-medium">{truck.truck_number}</TableCell>
                        <TableCell>{truck.company?.name || "N/A"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(truck.dot_inspection_date)}
                            {truck.dot_inspection_date && (
                              <Badge variant={getExpirationStatus(truck.dot_inspection_date).variant}>
                                {getExpirationStatus(truck.dot_inspection_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(truck.plate_expiration_date)}
                            {truck.plate_expiration_date && (
                              <Badge variant={getExpirationStatus(truck.plate_expiration_date).variant}>
                                {getExpirationStatus(truck.plate_expiration_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(truck.insurance_expiration_date)}
                            {truck.insurance_expiration_date && (
                              <Badge variant={getExpirationStatus(truck.insurance_expiration_date).variant}>
                                {getExpirationStatus(truck.insurance_expiration_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="trailers" className="mt-6">
              {trailersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded">
                      <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : trailers.length === 0 ? (
                <p className="text-muted-foreground">No trailers with expiring documents.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trailer #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>DOT Inspection</TableHead>
                      <TableHead>Plate Expiration</TableHead>
                      <TableHead>Insurance Expiration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trailers.map((trailer) => (
                      <TableRow key={trailer.id}>
                        <TableCell className="font-medium">{trailer.trailer_number}</TableCell>
                        <TableCell>{trailer.trailer_type || "N/A"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(trailer.dot_inspection_date)}
                            {trailer.dot_inspection_date && (
                              <Badge variant={getExpirationStatus(trailer.dot_inspection_date).variant}>
                                {getExpirationStatus(trailer.dot_inspection_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(trailer.plate_expiration_date)}
                            {trailer.plate_expiration_date && (
                              <Badge variant={getExpirationStatus(trailer.plate_expiration_date).variant}>
                                {getExpirationStatus(trailer.plate_expiration_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(trailer.insurance_expiration_date)}
                            {trailer.insurance_expiration_date && (
                              <Badge variant={getExpirationStatus(trailer.insurance_expiration_date).variant}>
                                {getExpirationStatus(trailer.insurance_expiration_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="drivers" className="mt-6">
              {driversLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded">
                      <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : drivers.length === 0 ? (
                <p className="text-muted-foreground">No drivers with expiring documents.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver Name</TableHead>
                      <TableHead>CDL Expiration</TableHead>
                      <TableHead>MVR Date</TableHead>
                      <TableHead>Clearing House</TableHead>
                      <TableHead>Medical Card Exp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drivers.map((driver) => (
                      <TableRow key={driver.id}>
                        <TableCell className="font-medium">{driver.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(driver.cdl_expiration_date)}
                            {driver.cdl_expiration_date && (
                              <Badge variant={getExpirationStatus(driver.cdl_expiration_date).variant}>
                                {getExpirationStatus(driver.cdl_expiration_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(driver.mvr_date)}
                            {driver.mvr_date && (
                              <Badge variant={getExpirationStatus(driver.mvr_date).variant}>
                                {getExpirationStatus(driver.mvr_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(driver.clearing_house)}
                            {driver.clearing_house && (
                              <Badge variant={getExpirationStatus(driver.clearing_house).variant}>
                                {getExpirationStatus(driver.clearing_house).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(driver.medical_card_expiration_date)}
                            {driver.medical_card_expiration_date && (
                              <Badge variant={getExpirationStatus(driver.medical_card_expiration_date).variant}>
                                {getExpirationStatus(driver.medical_card_expiration_date).label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
