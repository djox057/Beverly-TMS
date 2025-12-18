import { useMemo, useState, useRef, useEffect } from "react";
import { useChristmasNotes } from "@/hooks/useChristmasNotes";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Pencil } from "lucide-react";
import { ChristmasNoteDialog } from "@/components/ChristmasNoteDialog";

const OFFICE_ORDER = ["Čačak", "KRAGUJEVAC", "BEOGRAD", "Recovery"];

const Christmas = () => {
  const { christmasNotes, isLoading } = useChristmasNotes();
  const { user } = useAuthContext();
  const [activeOffice, setActiveOffice] = useState<string>("Čačak");
  const [searchFilter, setSearchFilter] = useState("");
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    driverId: string;
    driverName: string;
    truckId: string | null;
    truckNumber: string;
  } | null>(null);

  // Video ping-pong loop
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReversing, setIsReversing] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animationId: number;

    const handleEnded = () => {
      setIsReversing(true);
    };

    const reversePlayback = () => {
      if (!isReversing || !video) return;
      
      video.currentTime -= 0.033; // ~30fps reverse
      
      if (video.currentTime <= 0) {
        video.currentTime = 0;
        setIsReversing(false);
        video.play();
      } else {
        animationId = requestAnimationFrame(reversePlayback);
      }
    };

    video.addEventListener("ended", handleEnded);

    if (isReversing) {
      animationId = requestAnimationFrame(reversePlayback);
    }

    return () => {
      video.removeEventListener("ended", handleEnded);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isReversing]);

  // Filter to only show notes that have actual text
  const notesWithContent = useMemo(() => 
    christmasNotes.filter(n => n.note && n.note.trim() !== ""),
    [christmasNotes]
  );

  // Apply search filter
  const filteredNotes = useMemo(() => {
    if (!searchFilter.trim()) return notesWithContent;
    const search = searchFilter.toLowerCase();
    return notesWithContent.filter(n => 
      n.truck_number?.toLowerCase().includes(search) ||
      n.driver_name?.toLowerCase().includes(search)
    );
  }, [notesWithContent, searchFilter]);

  // Group notes by office then by dispatcher
  const groupedByOffice = useMemo(() => {
    const groups: Record<string, Record<string, typeof filteredNotes>> = {};
    
    // Initialize all offices
    OFFICE_ORDER.forEach(office => {
      groups[office] = {};
    });
    groups["Other"] = {};
    
    filteredNotes.forEach(note => {
      const office = note.dispatcher_office && OFFICE_ORDER.includes(note.dispatcher_office) 
        ? note.dispatcher_office 
        : "Other";
      const dispatcherName = note.dispatcher_name || "Unknown";
      
      if (!groups[office][dispatcherName]) {
        groups[office][dispatcherName] = [];
      }
      groups[office][dispatcherName].push(note);
    });
    
    return groups;
  }, [filteredNotes]);

  // Count notes per office for badge display
  const officeNoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    OFFICE_ORDER.forEach(office => {
      counts[office] = Object.values(groupedByOffice[office] || {}).flat().length;
    });
    return counts;
  }, [groupedByOffice]);

  const handleEditNote = (note: typeof notesWithContent[0]) => {
    setEditDialog({
      open: true,
      driverId: note.driver_id,
      driverName: note.driver_name || "Unknown",
      truckId: note.truck_id,
      truckNumber: note.truck_number || "-",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeOfficeData = groupedByOffice[activeOffice] || {};
  const hasDataInActiveOffice = Object.keys(activeOfficeData).length > 0;

  return (
    <div className="w-full flex flex-col h-full relative overflow-hidden isolate">
      {/* Background Video with ping-pong loop */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ pointerEvents: "none" }}
      >
        <source src="/videos/christmas-background.mp4" type="video/mp4" />
      </video>
      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-background/40" />

      <div className="relative z-10 w-full flex flex-col h-full">
        {/* Header */}
      <div className="text-center py-4 border-b">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-3">
          <span className="text-3xl animate-bounce" style={{ animationDelay: "0ms" }}>❄️</span>
          Christmas Notes
          <span className="text-3xl animate-bounce" style={{ animationDelay: "200ms" }}>❄️</span>
        </h1>
      </div>

      {/* Office Tabs */}
      <div className="flex border-b bg-muted/30">
        {OFFICE_ORDER.map((office) => (
          <button
            key={office}
            onClick={() => setActiveOffice(office)}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors relative ${
              activeOffice === office
                ? "bg-background text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {office}
            {officeNoteCounts[office] > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                {officeNoteCounts[office]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search Filter */}
      <div className="p-4 border-b">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Truck # or Driver..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {notesWithContent.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">🎄</p>
            <p className="text-muted-foreground">No Christmas notes yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click the ❄️ icon next to a driver in Reports to add a note
            </p>
          </div>
        ) : !hasDataInActiveOffice ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchFilter ? "No matching notes found" : `No notes for ${activeOffice} office`}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(activeOfficeData).map(([dispatcherName, notes]) => (
              <div key={dispatcherName} className="space-y-2">
                {/* Dispatcher Header */}
                <div className="bg-muted/50 px-4 py-2 rounded-t-lg border-l-4 border-primary">
                  <h3 className="font-semibold text-foreground">
                    {dispatcherName}
                    <span className="ml-2 text-sm text-muted-foreground font-normal">
                      ({notes.length} {notes.length === 1 ? 'driver' : 'drivers'})
                    </span>
                  </h3>
                </div>
                
                {/* Table for this dispatcher's notes */}
                <div className="border rounded-b-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-[100px]">Truck #</TableHead>
                        <TableHead className="w-[200px]">Driver</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notes.map((note) => {
                        const canEdit = note.dispatcher_id === user?.id;
                        return (
                          <TableRow key={note.id}>
                            <TableCell className="font-mono font-medium">
                              {note.truck_number || "-"}
                            </TableCell>
                            <TableCell>{note.driver_name}</TableCell>
                            <TableCell>
                              <p className="whitespace-pre-wrap">{note.note}</p>
                            </TableCell>
                            <TableCell>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEditNote(note)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editDialog && (
        <ChristmasNoteDialog
          open={editDialog.open}
          onOpenChange={(open) => !open && setEditDialog(null)}
          driverId={editDialog.driverId}
          driverName={editDialog.driverName}
          truckId={editDialog.truckId}
          truckNumber={editDialog.truckNumber}
        />
      )}
    </div>
  </div>
  );
};

export default Christmas;