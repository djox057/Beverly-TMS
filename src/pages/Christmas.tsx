import { useMemo } from "react";
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

const OFFICE_ORDER = ["Čačak", "KRAGUJEVAC", "BEOGRAD", "Recovery"];

const Christmas = () => {
  const { christmasNotes, isLoading } = useChristmasNotes();

  // Filter to only show notes that have actual text
  const notesWithContent = useMemo(() => 
    christmasNotes.filter(n => n.note && n.note.trim() !== ""),
    [christmasNotes]
  );

  // Group notes by office then by dispatcher
  const groupedByOffice = useMemo(() => {
    const groups: Record<string, Record<string, typeof notesWithContent>> = {};
    
    // Initialize all offices
    OFFICE_ORDER.forEach(office => {
      groups[office] = {};
    });
    groups["Other"] = {};
    
    notesWithContent.forEach(note => {
      const office = note.dispatcher_office && OFFICE_ORDER.includes(note.dispatcher_office) 
        ? note.dispatcher_office 
        : "Other";
      const dispatcherName = note.dispatcher_name || "Unknown";
      
      if (!groups[office][dispatcherName]) {
        groups[office][dispatcherName] = [];
      }
      groups[office][dispatcherName].push(note);
    });
    
    // Remove empty offices
    Object.keys(groups).forEach(office => {
      if (Object.keys(groups[office]).length === 0) {
        delete groups[office];
      }
    });
    
    return groups;
  }, [notesWithContent]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full py-6 px-4 space-y-6">
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
        <div className="space-y-8">
          {OFFICE_ORDER.filter(office => groupedByOffice[office]).map(office => (
            <div key={office} className="space-y-4">
              {/* Office Header */}
              <h2 className="text-xl font-semibold border-b pb-2 flex items-center gap-2">
                <span>🏢</span>
                {office}
              </h2>
              
              {/* Dispatchers within this office */}
              {Object.entries(groupedByOffice[office]).map(([dispatcherName, notes]) => (
                <div key={dispatcherName} className="ml-4 space-y-2">
                  {/* Dispatcher Header */}
                  <h3 className="text-lg font-medium text-primary flex items-center gap-2">
                    <span>👤</span>
                    {dispatcherName}
                    <span className="text-sm text-muted-foreground">({notes.length} {notes.length === 1 ? 'note' : 'notes'})</span>
                  </h3>
                  
                  {/* Table for this dispatcher's notes */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[120px]">Truck #</TableHead>
                          <TableHead className="w-[250px]">Driver Name</TableHead>
                          <TableHead>Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {notes.map((note) => (
                          <TableRow key={note.id}>
                            <TableCell className="font-medium">
                              {note.truck_number || "-"}
                            </TableCell>
                            <TableCell className="font-medium">{note.driver_name}</TableCell>
                            <TableCell>
                              <p className="whitespace-pre-wrap">{note.note}</p>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          ))}
          
          {/* Other office (if any notes don't match known offices) */}
          {groupedByOffice["Other"] && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold border-b pb-2 flex items-center gap-2">
                <span>🏢</span>
                Other
              </h2>
              
              {Object.entries(groupedByOffice["Other"]).map(([dispatcherName, notes]) => (
                <div key={dispatcherName} className="ml-4 space-y-2">
                  <h3 className="text-lg font-medium text-primary flex items-center gap-2">
                    <span>👤</span>
                    {dispatcherName}
                    <span className="text-sm text-muted-foreground">({notes.length} {notes.length === 1 ? 'note' : 'notes'})</span>
                  </h3>
                  
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[120px]">Truck #</TableHead>
                          <TableHead className="w-[250px]">Driver Name</TableHead>
                          <TableHead>Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {notes.map((note) => (
                          <TableRow key={note.id}>
                            <TableCell className="font-medium">
                              {note.truck_number || "-"}
                            </TableCell>
                            <TableCell className="font-medium">{note.driver_name}</TableCell>
                            <TableCell>
                              <p className="whitespace-pre-wrap">{note.note}</p>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Christmas;
