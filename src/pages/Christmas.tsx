import { useChristmasNotes } from "@/hooks/useChristmasNotes";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

const Christmas = () => {
  const { christmasNotes, isLoading } = useChristmasNotes();

  // Filter to only show notes that have actual text
  const notesWithContent = christmasNotes.filter(n => n.note && n.note.trim() !== "");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
          <span className="text-4xl animate-bounce" style={{ animationDelay: "0ms" }}>❄️</span>
          Christmas
          <span className="text-4xl animate-bounce" style={{ animationDelay: "200ms" }}>❄️</span>
        </h1>
        <p className="text-muted-foreground mt-2">Driver Christmas Notes</p>
      </div>

      {notesWithContent.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-4">🎄</p>
          <p className="text-muted-foreground">No Christmas notes yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click the ❄️ icon next to a driver in Reports to add a note
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">Truck #</TableHead>
                <TableHead className="w-[200px]">Driver Name</TableHead>
                <TableHead className="w-[150px]">Dispatcher</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notesWithContent.map((note) => (
                <TableRow key={note.id}>
                  <TableCell className="font-medium">
                    {note.truck_number || "-"}
                  </TableCell>
                  <TableCell>{note.driver_name}</TableCell>
                  <TableCell>{note.dispatcher_name}</TableCell>
                  <TableCell className="max-w-md">
                    <p className="whitespace-pre-wrap">{note.note}</p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default Christmas;
