import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewDriverExpense } from "@/hooks/useDriverExpenses";

interface AddDriverExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  truckNumber?: string;
  trailerNumber?: string;
  onSubmit: (expense: NewDriverExpense) => void;
  isSubmitting?: boolean;
}

export function AddDriverExpenseDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
  truckNumber,
  trailerNumber,
  onSubmit,
  isSubmitting
}: AddDriverExpenseDialogProps) {
  const [formData, setFormData] = useState({
    name: driverName,
    explanation: "",
    expense_date: "",
    amount: "",
    status: "pending",
    paid_date: "",
    paid_amount: "",
    notice_1: "",
    notice_2: "",
    truck_number: truckNumber || "",
    trailer_number: trailerNumber || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onSubmit({
      driver_id: driverId,
      name: formData.name,
      explanation: formData.explanation,
      expense_date: formData.expense_date || null,
      amount: parseFloat(formData.amount) || 0,
      status: formData.status,
      paid_date: formData.paid_date || null,
      paid_amount: formData.paid_amount ? parseFloat(formData.paid_amount) : null,
      notice_1: formData.notice_1 || null,
      notice_2: formData.notice_2 || null,
      truck_number: formData.truck_number || null,
      trailer_number: formData.trailer_number || null,
      is_fixed: false,
    });

    // Reset form
    setFormData({
      name: driverName,
      explanation: "",
      expense_date: "",
      amount: "",
      status: "pending",
      paid_date: "",
      paid_amount: "",
      notice_1: "",
      notice_2: "",
      truck_number: truckNumber || "",
      trailer_number: trailerNumber || "",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Driver Expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="truck_number">Truck</Label>
              <Input
                id="truck_number"
                value={formData.truck_number}
                onChange={(e) => setFormData({ ...formData, truck_number: e.target.value })}
                placeholder="Truck number"
              />
            </div>
            <div>
              <Label htmlFor="trailer_number">Trailer</Label>
              <Input
                id="trailer_number"
                value={formData.trailer_number}
                onChange={(e) => setFormData({ ...formData, trailer_number: e.target.value })}
                placeholder="Trailer number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Name"
                required
              />
            </div>
            <div>
              <Label htmlFor="explanation">Explanation</Label>
              <Input
                id="explanation"
                value={formData.explanation}
                onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                placeholder="Expense explanation"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="expense_date">Date</Label>
              <Input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="paid_date">Paid Date</Label>
              <Input
                id="paid_date"
                type="date"
                value={formData.paid_date}
                onChange={(e) => setFormData({ ...formData, paid_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="paid_amount">Paid Amount ($)</Label>
              <Input
                id="paid_amount"
                type="number"
                step="0.01"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="notice_1">Notice 1</Label>
              <Input
                id="notice_1"
                value={formData.notice_1}
                onChange={(e) => setFormData({ ...formData, notice_1: e.target.value })}
                placeholder="Notice 1"
              />
            </div>
            <div>
              <Label htmlFor="notice_2">Notice 2</Label>
              <Input
                id="notice_2"
                value={formData.notice_2}
                onChange={(e) => setFormData({ ...formData, notice_2: e.target.value })}
                placeholder="Notice 2"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Expense"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
