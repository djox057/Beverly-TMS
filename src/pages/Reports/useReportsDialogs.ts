import { useState, useCallback, useMemo } from "react";

// Dialog state types
export interface DrugTestDialogState {
  driverId: string;
  driverName: string;
  truckId: string;
}

export interface GameOverDialogState {
  truckId: string;
  truckNumber: string;
  existingDates: string[];
  needsRecovery: boolean;
  hasRecoveryDriver: boolean;
}

export interface YardActionDialogState {
  driverId: string;
  driverName: string;
  driver2Id?: string;
  driver2Name?: string;
  truckNumber?: string;
}

export interface TwoWeekNoticeDialogState {
  driverId: string;
  driverName: string;
  driver2Id?: string;
  driver2Name?: string;
}

export interface ZoomedLoadState {
  orderId: string;
  loadNumber: string;
  brokerLoadNumber: string;
  allPickupStops: any[];
  allDeliveryStops: any[];
  documents: string[];
  notes: string;
  truckNumber: string;
  driverNames: string;
  companyName: string;
  internalLoadNumber: string;
  freightAmount: number;
  loadedMiles: number;
  driverPay: number;
  bolForceComplete?: boolean;
  podForceComplete?: boolean;
  orderFiles?: any[];
}

export interface CashAdvanceDialogState {
  driverId: string;
  driverName: string;
  truckNumber: string;
  companyName: string;
}

export interface ArrivalTimeDialogState {
  pickupDropId: string;
  type: "pickup" | "delivery";
}

export interface CheckInOutDialogState {
  pickupDropId: string;
  type: "pickup" | "delivery";
  checkInTime: string | null;
  checkOutTime: string | null;
}

export interface HomeTimeDialogState {
  truckId: string;
  truckNumber: string;
  driverId: string;
  date: string;
  isCurrentlyHomeTime: boolean;
}

export interface RedCellDialogState {
  truckId: string;
  truckNumber: string;
  driverId: string;
  date: string;
  currentNote: string;
}

export interface NoteDialogState {
  truckId: string;
  driverId: string | null;
}

export interface TruckMapViewState {
  truckNumber: string;
  latitude: number;
  longitude: number;
}

export interface DispatcherFleetMapState {
  dispatcherId: string;
  dispatcherName: string;
  trucks: Array<{
    id: string;
    truckNumber: string;
    driverName: string;
    driver2Name?: string;
    currentOrder?: {
      id: string;
      loadNumber: string;
      brokerLoadNumber?: string;
      pickupAddress?: string;
      deliveryAddress?: string;
      pickupDatetime?: string;
      deliveryDatetime?: string;
      hasBOL: boolean;
      hasPOD: boolean;
      pickupArrived: boolean;
    };
  }>;
}

// Consolidated dialog state hook
export function useReportsDialogs() {
  // Dialog states
  const [drugTestDialog, setDrugTestDialog] = useState<DrugTestDialogState | null>(null);
  const [gameOverDialog, setGameOverDialog] = useState<GameOverDialogState | null>(null);
  const [yardActionDialog, setYardActionDialog] = useState<YardActionDialogState | null>(null);
  const [twoWeekNoticeDialog, setTwoWeekNoticeDialog] = useState<TwoWeekNoticeDialogState | null>(null);
  const [zoomedLoad, setZoomedLoad] = useState<ZoomedLoadState | null>(null);
  const [cashAdvanceDialog, setCashAdvanceDialog] = useState<CashAdvanceDialogState | null>(null);
  const [arrivalTimeDialog, setArrivalTimeDialog] = useState<ArrivalTimeDialogState | null>(null);
  const [checkInOutDialog, setCheckInOutDialog] = useState<CheckInOutDialogState | null>(null);
  const [homeTimeDialog, setHomeTimeDialog] = useState<HomeTimeDialogState | null>(null);
  const [redCellDialog, setRedCellDialog] = useState<RedCellDialogState | null>(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState<NoteDialogState | null>(null);
  const [truckMapView, setTruckMapView] = useState<TruckMapViewState | null>(null);
  const [fleetMapDialog, setFleetMapDialog] = useState<DispatcherFleetMapState | null>(null);
  
  // Simple boolean dialogs
  const [legendDialogOpen, setLegendDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [lumperDialogOpen, setLumperDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  
  // Note dialog content
  const [noteDialogContent, setNoteDialogContent] = useState<string>("");
  const [historyDialogDriverId, setHistoryDialogDriverId] = useState<string | null>(null);
  
  // Yard action form state
  const [yardActionType, setYardActionType] = useState<"maintenance" | "return_truck" | "recovery" | "safety" | "">("");
  const [yardActionComment, setYardActionComment] = useState("");
  const [yardActionDatetime, setYardActionDatetime] = useState<Date | undefined>(new Date());
  
  // Two week notice form state
  const [twoWeekNoticeDate, setTwoWeekNoticeDate] = useState<Date | undefined>(new Date());
  
  // Cancel form state
  const [cancelFormData, setCancelFormData] = useState({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
  
  // Lumper state
  const [lumperAmount, setLumperAmount] = useState("");
  const [lumperConfirmation, setLumperConfirmation] = useState<string | null>(null);
  
  // Upload state
  const [uploadDocType, setUploadDocType] = useState<string>("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  
  // Red cell state
  const [redCellNote, setRedCellNote] = useState("");
  const [redCellIsHomeTime, setRedCellIsHomeTime] = useState(false);
  
  // Cash advance state
  const [cashAdvanceAmount, setCashAdvanceAmount] = useState(50);

  // Close handlers with cleanup
  const closeYardActionDialog = useCallback(() => {
    setYardActionDialog(null);
    setYardActionType("");
    setYardActionComment("");
    setYardActionDatetime(new Date());
  }, []);

  const closeTwoWeekNoticeDialog = useCallback(() => {
    setTwoWeekNoticeDialog(null);
    setTwoWeekNoticeDate(new Date());
  }, []);

  const closeCancelDialog = useCallback(() => {
    setCancelDialogOpen(false);
    setCancelFormData({ tonu: "", driverRate: "", dhMiles: "", notes: "" });
  }, []);

  const closeUploadDialog = useCallback(() => {
    setUploadDialogOpen(false);
    setUploadFiles([]);
    setUploadDocType("");
  }, []);

  const closeRedCellDialog = useCallback(() => {
    setRedCellDialog(null);
    setRedCellNote("");
    setRedCellIsHomeTime(false);
  }, []);

  const closeLumperDialog = useCallback(() => {
    setLumperDialogOpen(false);
    setLumperAmount("");
    setLumperConfirmation(null);
  }, []);

  // Memoized return value to prevent unnecessary re-renders
  return useMemo(() => ({
    // Dialog states
    drugTestDialog,
    setDrugTestDialog,
    gameOverDialog,
    setGameOverDialog,
    yardActionDialog,
    setYardActionDialog,
    twoWeekNoticeDialog,
    setTwoWeekNoticeDialog,
    zoomedLoad,
    setZoomedLoad,
    cashAdvanceDialog,
    setCashAdvanceDialog,
    arrivalTimeDialog,
    setArrivalTimeDialog,
    checkInOutDialog,
    setCheckInOutDialog,
    homeTimeDialog,
    setHomeTimeDialog,
    redCellDialog,
    setRedCellDialog,
    noteDialogOpen,
    setNoteDialogOpen,
    truckMapView,
    setTruckMapView,
    fleetMapDialog,
    setFleetMapDialog,
    
    // Simple dialogs
    legendDialogOpen,
    setLegendDialogOpen,
    cancelDialogOpen,
    setCancelDialogOpen,
    lumperDialogOpen,
    setLumperDialogOpen,
    uploadDialogOpen,
    setUploadDialogOpen,
    
    // Note dialog
    noteDialogContent,
    setNoteDialogContent,
    historyDialogDriverId,
    setHistoryDialogDriverId,
    
    // Yard action form
    yardActionType,
    setYardActionType,
    yardActionComment,
    setYardActionComment,
    yardActionDatetime,
    setYardActionDatetime,
    
    // Two week notice form
    twoWeekNoticeDate,
    setTwoWeekNoticeDate,
    
    // Cancel form
    cancelFormData,
    setCancelFormData,
    
    // Lumper form
    lumperAmount,
    setLumperAmount,
    lumperConfirmation,
    setLumperConfirmation,
    
    // Upload form
    uploadDocType,
    setUploadDocType,
    uploadFiles,
    setUploadFiles,
    
    // Red cell form
    redCellNote,
    setRedCellNote,
    redCellIsHomeTime,
    setRedCellIsHomeTime,
    
    // Cash advance form
    cashAdvanceAmount,
    setCashAdvanceAmount,
    
    // Close handlers
    closeYardActionDialog,
    closeTwoWeekNoticeDialog,
    closeCancelDialog,
    closeUploadDialog,
    closeRedCellDialog,
    closeLumperDialog,
  }), [
    drugTestDialog,
    gameOverDialog,
    yardActionDialog,
    twoWeekNoticeDialog,
    zoomedLoad,
    cashAdvanceDialog,
    arrivalTimeDialog,
    checkInOutDialog,
    homeTimeDialog,
    redCellDialog,
    noteDialogOpen,
    truckMapView,
    fleetMapDialog,
    legendDialogOpen,
    cancelDialogOpen,
    lumperDialogOpen,
    uploadDialogOpen,
    noteDialogContent,
    historyDialogDriverId,
    yardActionType,
    yardActionComment,
    yardActionDatetime,
    twoWeekNoticeDate,
    cancelFormData,
    lumperAmount,
    lumperConfirmation,
    uploadDocType,
    uploadFiles,
    redCellNote,
    redCellIsHomeTime,
    cashAdvanceAmount,
    closeYardActionDialog,
    closeTwoWeekNoticeDialog,
    closeCancelDialog,
    closeUploadDialog,
    closeRedCellDialog,
    closeLumperDialog,
  ]);
}
