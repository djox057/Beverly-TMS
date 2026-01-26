# /reports Page Specification

## 1. Overview

- Purpose: Display all driver/truck assignments with their orders on a calendar-like view
- Data sources: Database (unlocked orders) + Storage bucket (locked/archived orders)

## 2. Which Orders Should Display

### 2.1 General Rule

**ALL orders should display in Reports** except:

- Canceled orders (with one exception below)
- GAME|OVER placeholder orders (visual indicators only)

### 2.2 Canceled Order Exception

The **most recent canceled order** SHOULD display IF:

- The canceled order's pickup date is today (string comparison, no timezone conversion)
- There is NO other non-canceled order for that driver with the same or later pickup date

### 2.3 Locked Orders from Archive

- Locked orders are loaded from storage bucket (CSV cache)
- Locked orders ALWAYS have POD (they can't be locked without POD)
- Locked orders should display in reports (they're historical but relevant)
- Locked canceled orders should NOT display

### 2.4 Orders with POD (Completed)

- **SHOULD display** in reports
- POD status affects COLOR of cells, not whether they display
- POD status determines "current order" selection

## 3. Current Order Logic

### 3.1 What is "Current Order"?

The order that appears in the main pickup/delivery columns and affects truck status.

### 3.2 Selection Priority

1. **Going To selection**: If user clicked "Going To Pickup/Delivery", that order becomes current
2. **First order without POD in a sequence**: First order without POD unless condition below.
3. **First order without POD**: If there is order with POD after it then it goes to next order without POD
4. **in_transit orders** don't take priority over pending orders
5. **Earliest pickup time** for ordering among same-status orders

### 3.3 Exception Cases

- If a load without POD is followed by a load WITH POD, then another load without POD → the First next load without POD is current

## 4. Cell Colors (Pickup/Delivery)

### 4.1 Pickup Cell Colors

- **Red (Destructive)**: Canceled order
- **Purple**: Recovery load
- **Green (Complete)**: Has BOL or POD
- **Cyan (#00FFFF)**: Previous load delivery is complete (ready for this pickup)
- **Dark Blue**: At pickup

### 4.2 Delivery Cell Colors

- **Red (Destructive)**: Canceled order
- **Purple**: Recovery load
- **Green (Complete)**: Has POD
- **Orange (Late)**: Delivery is past due
- **Lime**: Has BOL but not arrived
- **Dark Blue**: Arrived at delivery

### 4.3 Empty Day Cells (Red cells)

Shown when:

- Day is after first pickup date
- No pickup scheduled for that day
- Not in transit (between pickup and delivery)
- No game over before today

Content options:

- "Empty" - today with no load
- "Lost day" - past days with no load
- "No pre-book 🥺?" - tomorrow with no load
- "Home Time" - marked as home time
- Custom note from lost_day_notes

## 5. Document Status Indicators

### 5.1 Document Order

RC (Rate Confirmation) → BOL (Bill of Lading) → POD (Proof of Delivery) → Additional

### 5.2 Button Display Logic

**Going to Pickup button** shows when:

- No BOL file
- No going_to_at timestamp
- Previous orders all have POD (no incomplete deliveries blocking)

**At Pickup button** shows when:

- going_to_at exists
- 5+ seconds since clicking "Going to"
- No BOL file
- No arrived_at timestamp
- Previous orders all have POD

**Going to Delivery button** shows when:

- Has BOL file
- No going_to_at for delivery yet

**At Delivery button** shows when:

- Has BOL OR going_to_at for delivery exists
- 5+ seconds since clicking "Going to"
- No arrived_at timestamp

## 6. Calendar View

### 6.1 Structure

- Top half of cell: Delivery stops for that day
- Bottom half of cell: Pickup stops for that day
- Same-day pickup+delivery: Both appear in their respective halves

### 6.2 In Transit Display

- Shows ">>>" when between pickup and delivery dates
- Shows "RESCHEDULED" if order was rescheduled

### 6.3 Multi-Stop Loads

- Each stop renders separately on its scheduled day
- Cell width divided by number of stops on that day

## 7. Data Flow

### 7.1 Loading Process

1. Fetch unlocked orders from database (status != 'locked')
2. Load locked orders from storage bucket (CSV cache)
3. Deduplicate by order ID (database takes priority)
4. Match orders to drivers
5. Process transfer-aware stops for recovery/transfer loads

### 7.2 Caching

- Archive version tracked in `archive_versions` table
- Cache invalidated when version changes
- order_files from archive may be stale (POD uploads after lock)

## 8. Filters

### 8.1 Available Filters

- Truck # / Driver name
- Dispatch name
- Load # (broker load number)
- Show Empty Trucks (red cells for today)
- Show New Drivers (0 loads or 1 load with pickup today)
- Show Two Week Notice

### 8.2 Filter Behavior

- Auto-switches office tab when matches found in different office
- Filters apply across all order data

## 9. Transfer/Recovery Load Handling

### 9.1 Original Driver

- Sees original pickup
- Sees transfer location as delivery

### 9.2 Transfer Driver

- Sees previous transfer location as pickup
- Sees next transfer location OR final delivery as delivery

### 9.3 Display Label

- "Orig" for original driver
- "Rec 1", "Rec 2", etc. for transfer drivers

## 10. Known Issues / Current Bugs

### 10.1 activeOrders Filter Bug (FIXED)

The bug was in `src/hooks/useReports.ts` where `activeOrders` incorrectly filtered:

- Filtered OUT pending orders past delivery time (wrong - should include if no POD)

**FIX APPLIED:**

`activeOrders` now includes ANY pending/in_transit order without POD, regardless of delivery time.
This ensures orders like Load 4672 (pending, no POD, past delivery) display correctly.

The delivery time check was removed because:
- All orders display on calendar (per Section 2.4)
- `activeOrders` only determines "current order" selection
- POD status (not delivery time) determines if order is complete
