// Shared transformation for Orders data used across the app.
// This is the single source of truth for the shape stored in React Query.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformOrders(allOrders: any[]) {
  // Helper to safely convert values to numbers, handling "null" strings and undefined
  const toNum = (val: any): number => {
    if (val === null || val === undefined || val === "" || val === "null" || val === "NULL") {
      return 0;
    }
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const transformed = (allOrders || []).map((order: any) => {
    // CRITICAL: Never skip transformation - always recalculate totalFreightAmount
    // This ensures cached orders (which only have freight_amount) get proper totals
    // Parse JSONB fields back to arrays (already arrays from join)
    const pickupDrops = Array.isArray(order.pickup_drops) ? order.pickup_drops : [];
    const orderFiles = Array.isArray(order.order_files) ? [...order.order_files] : [];

    // Extract pickup and delivery information
    const firstPickup = pickupDrops.find((pd: any) => pd.type === "pickup");
    const lastDelivery = pickupDrops.filter((pd: any) => pd.type === "delivery").pop();

    // CRITICAL: Handle multiple field name variations
    // - DB orders use snake_case (freight_amount, driver_price)
    // - Some cached orders use camelCase (freightAmount, driverPrice)
    // - CSV cached orders might use shortened names (freight, driverPay)
    // - CSV cached orders may have "null" as STRINGS, not actual null values
    // Use toNum() helper to safely convert all values
    // Late fee, no tracking fee, wrong address fee, and other charges SUBTRACT from driver pay (penalties)
    const totalDriverPay =
      toNum(order.driver_price || order.driverPrice || order.driverPay) +
      toNum(order.detention_driver || order.detentionDriver) +
      toNum(order.layover_driver || order.layoverDriver) +
      toNum(order.tonu_driver || order.tonuDriver) +
      toNum(order.extra_stop_driver || order.extraStopDriver) +
      toNum(order.lumper_driver || order.lumperDriver) -
      toNum(order.late_fee_driver || order.lateFeeDriver) -
      toNum(order.no_tracking_fee_driver || order.noTrackingFeeDriver) -
      toNum(order.wrong_address_fee_driver || order.wrongAddressFeeDriver) -
      toNum(order.other_charges_driver || order.otherChargesDriver) +
      toNum(order.other_additionals_driver || order.otherAdditionalsDriver);

    // Calculate total freight amount - check freight_amount, freightAmount, AND freight
    // Use toNum() to handle "null" strings from CSV cached data
    // Other Charges SUBTRACTS, Other Additionals ADDS
    // Note: This includes lumper for Orders page display
    const totalFreightAmount =
      toNum(order.freight_amount || order.freightAmount || order.freight) +
      toNum(order.detention) +
      toNum(order.layover) +
      toNum(order.tonu) +
      toNum(order.extra_stop || order.extraStop) +
      toNum(order.lumper) -
      toNum(order.late_fee || order.lateFee) -
      toNum(order.no_tracking_fee || order.noTrackingFee) -
      toNum(order.wrong_address_fee || order.wrongAddressFee) +
      toNum(order.escort_fee || order.escortFee) -
      toNum(order.other_charges || order.otherCharges) +
      toNum(order.other_additionals || order.otherAdditionals);

    // Calculate total freight amount WITHOUT lumper - used for Analytics and Trips pages
    // This represents the net freight for commission calculations (lumper is reimbursement)
    const totalFreightAmountNoLumper =
      toNum(order.freight_amount || order.freightAmount || order.freight) +
      toNum(order.detention) +
      toNum(order.layover) +
      toNum(order.tonu) +
      toNum(order.extra_stop || order.extraStop) +
      toNum(order.escort_fee || order.escortFee) +
      toNum(order.other_additionals || order.otherAdditionals) -
      toNum(order.late_fee || order.lateFee) -
      toNum(order.no_tracking_fee || order.noTrackingFee) -
      toNum(order.wrong_address_fee || order.wrongAddressFee) -
      toNum(order.other_charges || order.otherCharges);

    // Force-complete: inject synthetic file entries so all downstream file-count logic works
    const bolForceComplete = order.bol_force_complete === true || order.bol_force_complete === "true";
    const podForceComplete = order.pod_force_complete === true || order.pod_force_complete === "true";

    if (bolForceComplete) {
      const pickupStopCount = pickupDrops.filter((pd: any) => pd.type === "pickup").length;
      const existingBolCount = orderFiles.filter((f: any) => f.file_category === "BOL").length;
      for (let i = existingBolCount; i < pickupStopCount; i++) {
        orderFiles.push({ id: `synthetic-bol-${i}`, file_category: "BOL", file_name: "force-complete", file_path: "" });
      }
    }

    if (podForceComplete) {
      const deliveryStopCount = pickupDrops.filter((pd: any) => pd.type === "delivery").length;
      const existingPodCount = orderFiles.filter((f: any) => f.file_category === "POD").length;
      for (let i = existingPodCount; i < deliveryStopCount; i++) {
        orderFiles.push({ id: `synthetic-pod-${i}`, file_category: "POD", file_name: "force-complete", file_path: "" });
      }
    }

    // Filter files by category
    const rcFiles = orderFiles.filter((f: any) => f.file_category === "RC");
    const podFiles = orderFiles.filter((f: any) => f.file_category === "POD");
    const bolFiles = orderFiles.filter((f: any) => f.file_category === "BOL");
    const additionalFiles = orderFiles.filter((f: any) => f.file_category === "ADDITIONAL");

    // Transform to camelCase with computed fields, flattening joined data
    return {
      // Basic fields
      id: order.id,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      loadNumber: order.load_number,
      internalLoadNumber: order.internal_load_number,
      // Convert to string to handle CSV numeric values in string operations
      brokerLoadNumber: order.broker_load_number != null ? String(order.broker_load_number) : null,
      status: order.status,
      locked: order.locked,
      canceled: order.canceled === true || order.canceled === "true" || order.canceled === 1,
      // Handle invoiced boolean - convert string "true"/"false" to actual boolean
      invoiced: order.invoiced === true || order.invoiced === "true" || order.invoiced === 1,
      // Handle paid boolean - convert string "true"/"false" to actual boolean
      paid: order.paid === true || order.paid === "true" || order.paid === 1,
      isRecovery: order.is_recovery === true || order.is_recovery === "true" || order.is_recovery === 1,

      // Truck and equipment - use enriched objects, fallback to deleted_* fields for archived orders
      // Handle "null" strings from CSV export
      truckNumber:
        order.truck?.truck_number ||
        (order.deleted_truck_number && order.deleted_truck_number !== "null" && order.deleted_truck_number !== "NULL"
          ? order.deleted_truck_number
          : null),
      truckId: order.truck_id,
      truckCompanyName: order.truck?.company?.name || null,
      truckCompanyId: order.truck?.company?.id || null,
      trailerNumber:
        order.trailer?.trailer_number ||
        (order.deleted_trailer_number &&
        order.deleted_trailer_number !== "null" &&
        order.deleted_trailer_number !== "NULL"
          ? order.deleted_trailer_number
          : null),
      trailerId: order.trailer_id,

      // Driver info - use enriched objects, fallback to deleted_* fields for archived orders
      // Handle "null" strings from CSV export
      driverName:
        order.driver1?.name ||
        (order.deleted_driver1_name && order.deleted_driver1_name !== "null" && order.deleted_driver1_name !== "NULL"
          ? order.deleted_driver1_name
          : null),
      driver1Name:
        order.driver1?.name ||
        (order.deleted_driver1_name && order.deleted_driver1_name !== "null" && order.deleted_driver1_name !== "NULL"
          ? order.deleted_driver1_name
          : null),
      driver2Name:
        order.driver2?.name ||
        (order.deleted_driver2_name && order.deleted_driver2_name !== "null" && order.deleted_driver2_name !== "NULL"
          ? order.deleted_driver2_name
          : null),
      driver1Id: order.driver1_id,
      driver2Id: order.driver2_id,
      driverCompanyName: order.driver1?.company?.name || null,
      driverCompanyId: order.driver1?.company_id || null,

      // Broker info - use enriched objects only (CSV direct fields are unreliable)
      brokerName: order.broker?.name || null,
      brokerAddress: order.broker?.address || null,
      brokerMcNumber: order.broker?.mc_number || null,
      brokerId: order.broker_id,

      // Company info - flatten joined data OR use direct fields from CSV
      companyName: order.company?.name || order.company_name || null,
      companyId: order.company_id,
      bookedBy: order.booked_by,
      bookedByCompanyName: order.booked_by_company?.name || order.booked_by_company_name || null,
      bookedByCompanyId: order.booked_by_company_id,

      // Pickup/Delivery extracted info - use ISO date strings for consistent parsing
      // CRITICAL: Cached orders don't have pickup_drops array, so fallback to order fields
      // Normalize date format: CSV dates use space separator, convert to ISO format with 'T'
      pickupDate: firstPickup?.datetime
        ? firstPickup.datetime
        : (order.pickup_datetime || order.pickupDatetime || "").replace(" ", "T"),
      pickupCity: firstPickup?.city || "",
      pickupState: firstPickup?.state || "",
      deliveryDate: lastDelivery?.datetime
        ? lastDelivery.datetime
        : (order.delivery_datetime || order.deliveryDatetime || "").replace(" ", "T"),
      deliveryCity: lastDelivery?.city || "",
      deliveryState: lastDelivery?.state || "",

      // Financial fields - broker amounts
      freightAmount: order.freight_amount,
      detention: order.detention,
      layover: order.layover,
      tonu: order.tonu,
      extraStop: order.extra_stop,
      lumper: order.lumper,
      lateFee: order.late_fee,
      noTrackingFee: order.no_tracking_fee,
      wrongAddressFee: order.wrong_address_fee,
      escortFee: order.escort_fee,
      escortFeeBrokerPaid: order.escort_fee_broker_paid,
      otherCharges: order.other_charges,
      otherChargesReason: (order as any).other_charges_reason,
      otherChargesItems: (order as any).other_charges_items,
      otherAdditionals: (order as any).other_additionals,
      otherAdditionalsReason: (order as any).other_additionals_reason,
      otherAdditionalsItems: (order as any).other_additionals_items,
      totalFreightAmount,
      totalFreightAmountNoLumper,

      // Financial fields - driver amounts
      driverPrice: order.driver_price,
      detentionDriver: order.detention_driver,
      layoverDriver: order.layover_driver,
      tonuDriver: order.tonu_driver,
      extraStopDriver: order.extra_stop_driver,
      lumperDriver: order.lumper_driver,
      lateFeeDriver: order.late_fee_driver,
      noTrackingFeeDriver: order.no_tracking_fee_driver,
      wrongAddressFeeDriver: order.wrong_address_fee_driver,
      otherChargesDriver: order.other_charges_driver,
      otherAdditionalsDriver: (order as any).other_additionals_driver,
      totalDriverPay,

      // Mileage fields - always compute mileage from loaded + dh + additional miles
      loadedMiles: order.loaded_miles,
      dhMiles: order.dh_miles,
      additionalMiles: (order as any).additional_miles,
      mileage: toNum(order.loaded_miles) + toNum(order.dh_miles) + toNum((order as any).additional_miles),

      // Recovery fields
      recoveryDate: order.recovery_date,
      recoveryMiles: order.recovery_miles,
      recoveryFreightAmount: order.recovery_freight_amount,
      recoveryDriverPrice: order.recovery_driver_price,

      // Original values
      originalMiles: order.original_miles,
      originalFreightAmount: order.original_freight_amount,
      originalDriverPrice: order.original_driver_price,
      originalLoadedMiles: order.original_loaded_miles,
      originalDhMiles: order.original_dh_miles,
      originalDetention: order.original_detention,
      originalDetentionDriver: order.original_detention_driver,
      originalLayover: order.original_layover,
      originalLayoverDriver: order.original_layover_driver,
      originalTonu: order.original_tonu,
      originalTonuDriver: order.original_tonu_driver,
      originalExtraStop: order.original_extra_stop,
      originalExtraStopDriver: order.original_extra_stop_driver,
      originalLumper: order.original_lumper,
      originalLumperDriver: order.original_lumper_driver,
      originalLateFee: order.original_late_fee,
      originalLateFeeDriver: order.original_late_fee_driver,
      originalNoTrackingFee: order.original_no_tracking_fee,
      originalNoTrackingFeeDriver: order.original_no_tracking_fee_driver,
      originalWrongAddressFee: order.original_wrong_address_fee,
      originalWrongAddressFeeDriver: order.original_wrong_address_fee_driver,
      originalEscortFee: order.original_escort_fee,
      originalEscortFeeBrokerPaid: order.original_escort_fee_broker_paid,
      originalOtherCharges: order.original_other_charges,
      originalOtherChargesDriver: order.original_other_charges_driver,
      originalNotes: order.original_notes,
      originalTruckNumber: order.original_truck?.truck_number || null,
      originalTrailerNumber: order.original_trailer?.trailer_number || null,
      originalDriver1Name: order.original_driver1?.name || null,
      originalDriver2Name: order.original_driver2?.name || null,
      originalTruckId: order.original_truck_id,
      originalTrailerId: order.original_trailer_id,
      originalDriver1Id: order.original_driver1_id,
      originalDriver2Id: order.original_driver2_id,

      // Other fields - handle "null" strings properly
      notes: order.notes === "null" || order.notes === "NULL" || !order.notes ? null : order.notes,
      commodity: order.commodity,
      weight: order.weight,
      poNumber: order.po_number,
      puNumber: order.pu_number,
      referenceNumber: order.reference_number,
      pickupDatetime: order.pickup_datetime,
      pickupEndDatetime: order.pickup_end_datetime,
      deliveryDatetime: order.delivery_datetime,
      deliveryEndDatetime: order.delivery_end_datetime,
      // Ensure null/undefined/"null" string values are properly converted to null
      dateChangeNotes:
        order.date_change_notes === "null" || order.date_change_notes === "NULL" || !order.date_change_notes
          ? null
          : order.date_change_notes,

      // Nested objects for compatibility - rebuild from joined data
      trucks: order.truck
        ? {
            truck_number: order.truck.truck_number,
            company: order.truck.company
              ? {
                  id: order.truck.company.id,
                  name: order.truck.company.name,
                }
              : null,
          }
        : null,
      trailers: order.trailer
        ? {
            trailer_number: order.trailer.trailer_number,
          }
        : null,
      drivers: order.driver1
        ? {
            name: order.driver1.name,
          }
        : null,
      driver2: order.driver2
        ? {
            name: order.driver2.name,
          }
        : null,
      original_driver1: order.original_driver1
        ? {
            name: order.original_driver1.name,
          }
        : null,
      original_driver2: order.original_driver2
        ? {
            name: order.original_driver2.name,
          }
        : null,
      original_truck: order.original_truck
        ? {
            truck_number: order.original_truck.truck_number,
          }
        : null,
      original_trailer: order.original_trailer
        ? {
            trailer_number: order.original_trailer.trailer_number,
          }
        : null,
      brokers: order.broker
        ? {
            name: order.broker.name,
            address: order.broker.address,
            mc_number: order.broker.mc_number,
          }
        : null,
      company: order.company
        ? {
            id: order.company.id,
            name: order.company.name,
          }
        : null,
      booked_by_company: order.booked_by_company
        ? {
            id: order.booked_by_company.id,
            name: order.booked_by_company.name,
          }
        : null,

      // Arrays
      pickup_drops: pickupDrops,
      order_files: orderFiles,
      order_transfers: Array.isArray(order.order_transfers)
        ? order.order_transfers.sort((a: any, b: any) => a.sequence_number - b.sequence_number)
        : [],
      recoveryHistory: Array.isArray(order.recovery_history)
        ? order.recovery_history.map((rh: any) => ({
            id: rh.id,
            recoveryDriver1Id: rh.recovery_driver1_id,
            recoveryDriver2Id: rh.recovery_driver2_id,
            recoveryTruckId: rh.recovery_truck_id,
            recoveryTrailerId: rh.recovery_trailer_id,
            recoveryDriver1Name: rh.recovery_driver1?.name,
            recoveryDriver2Name: rh.recovery_driver2?.name,
            recoveryTruckNumber: rh.recovery_truck?.truck_number,
            recoveryTrailerNumber: rh.recovery_trailer?.trailer_number,
            recoveryDriver1: rh.recovery_driver1,
            recoveryDriver2: rh.recovery_driver2,
            recoveryTruck: rh.recovery_truck,
            recoveryTrailer: rh.recovery_trailer,
          }))
        : [],
      rcFiles,
      podFiles,
      bolFiles,
      additionalFiles,
    };
  });

  return transformed;
}

// Reverse transform: Convert camelCase transformed orders back to snake_case for hooks that expect raw DB format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reverseTransformOrders(transformedOrders: any[]) {
  return (transformedOrders || []).map((order: any) => ({
    // Basic fields
    id: order.id,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    load_number: order.loadNumber,
    internal_load_number: order.internalLoadNumber,
    broker_load_number: order.brokerLoadNumber,
    status: order.status,
    locked: order.locked,
    canceled: order.canceled,
    invoiced: order.invoiced,
    paid: order.paid,
    is_recovery: order.isRecovery,

    // Truck and equipment
    truck_id: order.truckId,
    trailer_id: order.trailerId,
    deleted_truck_number: order.truckNumber,
    deleted_trailer_number: order.trailerNumber,

    // Driver info
    driver1_id: order.driver1Id,
    driver2_id: order.driver2Id,
    deleted_driver1_name: order.driver1Name,
    deleted_driver2_name: order.driver2Name,

    // Broker info
    broker_id: order.brokerId,

    // Company info
    company_id: order.companyId,
    booked_by: order.bookedBy,
    booked_by_company_id: order.bookedByCompanyId,

    // Pickup/Delivery datetime
    pickup_datetime: order.pickupDatetime,
    pickup_end_datetime: order.pickupEndDatetime,
    delivery_datetime: order.deliveryDatetime,
    delivery_end_datetime: order.deliveryEndDatetime,
    date_change_notes: order.dateChangeNotes,

    // Financial fields - broker amounts
    freight_amount: order.freightAmount,
    detention: order.detention,
    layover: order.layover,
    tonu: order.tonu,
    extra_stop: order.extraStop,
    lumper: order.lumper,
    late_fee: order.lateFee,
    no_tracking_fee: order.noTrackingFee,
    wrong_address_fee: order.wrongAddressFee,
    escort_fee: order.escortFee,
    escort_fee_broker_paid: order.escortFeeBrokerPaid,
    other_charges: order.otherCharges,
    other_charges_reason: order.otherChargesReason,
    other_charges_items: (order as any).otherChargesItems,
    other_additionals: order.otherAdditionals,
    other_additionals_reason: order.otherAdditionalsReason,
    other_additionals_items: (order as any).otherAdditionalsItems,

    // Financial fields - driver amounts
    driver_price: order.driverPrice,
    detention_driver: order.detentionDriver,
    layover_driver: order.layoverDriver,
    tonu_driver: order.tonuDriver,
    extra_stop_driver: order.extraStopDriver,
    lumper_driver: order.lumperDriver,
    late_fee_driver: order.lateFeeDriver,
    no_tracking_fee_driver: order.noTrackingFeeDriver,
    wrong_address_fee_driver: order.wrongAddressFeeDriver,
    other_charges_driver: order.otherChargesDriver,
    other_additionals_driver: order.otherAdditionalsDriver,

    // Mileage fields
    loaded_miles: order.loadedMiles,
    dh_miles: order.dhMiles,
    additional_miles: order.additionalMiles,

    // Recovery fields
    recovery_date: order.recoveryDate,
    recovery_miles: order.recoveryMiles,
    recovery_freight_amount: order.recoveryFreightAmount,
    recovery_driver_price: order.recoveryDriverPrice,

    // Original values
    original_miles: order.originalMiles,
    original_freight_amount: order.originalFreightAmount,
    original_driver_price: order.originalDriverPrice,
    original_loaded_miles: order.originalLoadedMiles,
    original_dh_miles: order.originalDhMiles,
    original_detention: order.originalDetention,
    original_detention_driver: order.originalDetentionDriver,
    original_layover: order.originalLayover,
    original_layover_driver: order.originalLayoverDriver,
    original_tonu: order.originalTonu,
    original_tonu_driver: order.originalTonuDriver,
    original_extra_stop: order.originalExtraStop,
    original_extra_stop_driver: order.originalExtraStopDriver,
    original_lumper: order.originalLumper,
    original_lumper_driver: order.originalLumperDriver,
    original_late_fee: order.originalLateFee,
    original_late_fee_driver: order.originalLateFeeDriver,
    original_no_tracking_fee: order.originalNoTrackingFee,
    original_no_tracking_fee_driver: order.originalNoTrackingFeeDriver,
    original_wrong_address_fee: order.originalWrongAddressFee,
    original_wrong_address_fee_driver: order.originalWrongAddressFeeDriver,
    original_escort_fee: order.originalEscortFee,
    original_escort_fee_broker_paid: order.originalEscortFeeBrokerPaid,
    original_other_charges: order.originalOtherCharges,
    original_other_charges_driver: order.originalOtherChargesDriver,
    original_notes: order.originalNotes,
    original_truck_id: order.originalTruckId,
    original_trailer_id: order.originalTrailerId,
    original_driver1_id: order.originalDriver1Id,
    original_driver2_id: order.originalDriver2Id,

    // Other fields
    notes: order.notes,
    commodity: order.commodity,
    weight: order.weight,
    po_number: order.poNumber,
    pu_number: order.puNumber,
    reference_number: order.referenceNumber,

    // Nested objects - reconstruct for compatibility
    truck: order.trucks ? {
      truck_number: order.trucks.truck_number,
      company: order.trucks.company,
    } : null,
    trailer: order.trailers ? {
      trailer_number: order.trailers.trailer_number,
    } : null,
    driver1: order.drivers ? {
      name: order.drivers.name,
    } : null,
    driver2: order.driver2 ? {
      name: order.driver2.name,
    } : null,
    broker: order.brokers ? {
      name: order.brokers.name,
      address: order.brokers.address,
      mc_number: order.brokers.mc_number,
    } : null,
    company: order.company,
    booked_by_company: order.booked_by_company,
    original_driver1: order.original_driver1,
    original_driver2: order.original_driver2,
    original_truck: order.original_truck,
    original_trailer: order.original_trailer,

    // Arrays - already in snake_case
    pickup_drops: order.pickup_drops,
    order_files: order.order_files,
    order_transfers: order.order_transfers,
    recovery_history: order.recoveryHistory?.map((rh: any) => ({
      id: rh.id,
      recovery_driver1_id: rh.recoveryDriver1Id,
      recovery_driver2_id: rh.recoveryDriver2Id,
      recovery_truck_id: rh.recoveryTruckId,
      recovery_trailer_id: rh.recoveryTrailerId,
      recovery_driver1: rh.recoveryDriver1,
      recovery_driver2: rh.recoveryDriver2,
      recovery_truck: rh.recoveryTruck,
      recovery_trailer: rh.recoveryTrailer,
    })) || [],
  }));
}
