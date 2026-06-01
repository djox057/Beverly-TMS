import { useAuthContext } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

const ALLOWED = ['manager', 'admin', 'recruiting', 'chicago_management'] as const;

const TruckSales = () => {
  const { hasRole, loading } = useAuthContext();

  if (loading) return null;

  const allowed = ALLOWED.some((r) => hasRole(r as any));
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Truck Sales</h1>
      <p className="text-muted-foreground">
        Truck sales management coming soon.
      </p>
    </div>
  );
};

export default TruckSales;