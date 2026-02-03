
# Backend Documentation Plan

## Overview

This plan outlines the creation of a comprehensive markdown documentation file that explains the entire backend architecture of the BF Prime Dispatch application. The app uses Supabase as its Backend-as-a-Service (BaaS) with Deno Edge Functions for serverless compute.

## Document Structure

The documentation will be organized into the following sections:

### 1. Architecture Overview
- Technology stack: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- How the frontend connects to the backend via `@supabase/supabase-js`
- Environment configuration and connection details

### 2. Database Schema
A complete breakdown of all 60+ tables organized by domain:

**Core Entities:**
- `drivers` - Driver profiles with compliance data (CDL, medical, HOS)
- `trucks` - Fleet vehicles with assignments and maintenance tracking
- `trailers` - Trailer inventory and status
- `orders` - Load/shipment records with full pricing breakdown
- `companies` - Trucking companies (BF Prime, United, BG Inc, Beverly Freight)
- `brokers` - Freight broker directory

**User & Auth:**
- `profiles` - User profile data linked to auth.users
- `user_roles` - Role-based access control (dispatch, admin, supervisor, etc.)

**Operations:**
- `pickup_drops` - Multi-stop pickup/delivery locations per order
- `order_transfers` - Load handoffs between drivers
- `order_files` - Document attachments (rate confirmations, BOLs, PODs)
- `recovery_history` - Breakdown recovery operations

**Analytics & Tracking:**
- `daily_driver_stats` - Historical lost day/home time records
- `dispatcher_daily_driver_counts` - Fleet size snapshots
- `analytics_dispatcher_period` - Performance aggregations
- `truck_locations` - GPS positions from Samsara

**Financial:**
- `driver_expenses` - Deductions and debts
- `driver_cash_advances` - Cash advance requests
- `fuel_transactions` - EFS fuel card data
- `repairs` - Equipment repair costs
- `dispatcher_salary_payments` - Payroll records

**Compliance & Safety:**
- `driver_drug_tests` - Drug test records
- `hos_requests` - Hours of Service edit requests
- `driver_pii_audit_log` - PII access logging

### 3. Database Functions & Triggers
Document all PostgreSQL functions:
- `handle_new_user()` - Creates profile and assigns default role on signup
- `has_role()` - Permission checking
- `log_truck_assignment_changes()` - Audit trail for fleet assignments
- `log_driver_dispatcher_changes()` - Tracks dispatcher reassignments
- `save_truck_note_history()` - Note version history
- `create_order_with_unique_load_number()` - Atomic order creation with company-scoped load numbers
- `get_assignment_history()` - Query assignment audit trail
- `capture_original_delivery_datetime()` - Tracks reschedules

### 4. Edge Functions
Complete documentation of all 40+ Deno edge functions organized by category:

**AI/Document Processing:**
- `extract-order-fields` - Gemini AI PDF parsing for rate confirmations
- `generate-load-confirmation` - PDF form filling with pdf-lib

**External Integrations:**
- `samsara-locations` - Real-time GPS from Samsara telematics
- `hos-sync` - Transit Tracking API for HOS data
- `calculate-mapbox-route` - Mapbox Directions API for mileage
- `geocode-address` - Address to coordinates conversion

**Communication:**
- `send-sms` - RingCentral SMS messaging
- `send-payroll-email` - Resend email with PDF attachments
- `send-password-reset` - Custom password reset flow
- `send-load-confirmation-email` - Driver load sheets
- `send-efs-request` / `send-cash-advance-request` - EFS card requests
- `telegram-webhook` / `setup-telegram-webhook` - HOS request notifications

**User Management:**
- `create-user` - Admin user creation
- `delete-user` - User removal
- `update-user-role` - Role modifications
- `logout-all-users` - Force sign-out all sessions

**Scheduled Jobs (CRON):**
- `record-daily-driver-stats` - Daily lost day calculations
- `record-dispatcher-driver-counts` - Daily fleet snapshots
- `cleanup-yard-arrivals` - Housekeeping
- `clear-weekly-plans` - Weekly plan reset
- `check-delivery-etas` - Late delivery detection
- `process-afterhours-schedule` - Shift scheduling

**Data Operations:**
- `search-orders` - Advanced order search with pagination
- `get-all-unlocked-orders` / `get-all-locked-orders` - Bulk order retrieval
- `calculate-distances-batch` - Batch mileage calculations
- `recalculate-load-miles` - Mile recalculation

### 5. Authentication & Authorization
- Supabase Auth with email/password
- Role-based access control (RBAC) with 11 roles
- Role hierarchy: admin > manager > supervisor > dispatch
- `hasRole()` permission checks in frontend
- Service role key usage in edge functions

### 6. Storage Buckets
Document all 9 storage buckets:
- `order-files` - Rate confirmations, BOLs, PODs, invoices
- `driver-files` - Driver documents
- `truck-files` / `trailer-files` - Equipment documents
- `efs-receipts` - Fuel receipts
- `email-attachments` - Public email assets
- `archived-orders` - Historical order backups
- `company-files` - Company documents
- `Profilne` - PDF templates

### 7. Real-time Subscriptions
- How `useDriversRealtime`, `useTrucksRealtime`, `useOrdersRealtime` work
- Supabase Realtime channels for live updates

### 8. Security Configuration
- Row Level Security (RLS) considerations
- Edge function JWT verification settings in `config.toml`
- PII audit logging for sensitive driver data

### 9. Third-Party Integrations
- **Samsara** - Vehicle telematics and GPS
- **Transit Tracking** - HOS/ELD data
- **Mapbox** - Geocoding and route calculation
- **RingCentral** - SMS messaging
- **Resend** - Transactional email
- **Telegram** - HOS request notifications
- **Google Gemini** - AI document extraction

## File Location

The documentation will be created at:
```
docs/BACKEND_ARCHITECTURE.md
```

## Technical Details

The documentation will include:
- Mermaid diagrams for entity relationships
- Code examples for common patterns
- Configuration snippets
- API endpoint documentation for edge functions
- Data flow diagrams for key operations

## Implementation Approach

1. Create the `docs/` directory if it doesn't exist
2. Write comprehensive markdown with proper headings and navigation
3. Include practical examples from the actual codebase
4. Document each edge function's purpose, inputs, outputs, and dependencies
5. Explain the data model relationships with foreign key references
