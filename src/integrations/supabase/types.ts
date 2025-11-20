export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      assignment_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          created_at: string
          driver1_id: string | null
          driver2_id: string | null
          id: string
          trailer_id: string | null
          truck_id: string | null
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          driver1_id?: string | null
          driver2_id?: string | null
          id?: string
          trailer_id?: string | null
          truck_id?: string | null
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          driver1_id?: string | null
          driver2_id?: string | null
          id?: string
          trailer_id?: string | null
          truck_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_history_driver1_id_fkey"
            columns: ["driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_history_driver2_id_fkey"
            columns: ["driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_history_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_history_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      brokers: {
        Row: {
          address: string
          created_at: string
          id: string
          mc_number: string
          name: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          mc_number: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          mc_number?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      canceled_orders_backup: {
        Row: {
          cancel_dh_miles: number | null
          cancel_driver_rate: number | null
          cancel_notes: string | null
          cancel_tonu: number | null
          canceled_at: string
          canceled_by: string | null
          created_at: string
          id: string
          order_id: string
          original_dh_miles: number | null
          original_driver_price: number | null
          original_freight_amount: number | null
          original_loaded_miles: number | null
          original_notes: string | null
          original_tonu: number | null
          original_tonu_driver: number | null
          updated_at: string
        }
        Insert: {
          cancel_dh_miles?: number | null
          cancel_driver_rate?: number | null
          cancel_notes?: string | null
          cancel_tonu?: number | null
          canceled_at?: string
          canceled_by?: string | null
          created_at?: string
          id?: string
          order_id: string
          original_dh_miles?: number | null
          original_driver_price?: number | null
          original_freight_amount?: number | null
          original_loaded_miles?: number | null
          original_notes?: string | null
          original_tonu?: number | null
          original_tonu_driver?: number | null
          updated_at?: string
        }
        Update: {
          cancel_dh_miles?: number | null
          cancel_driver_rate?: number | null
          cancel_notes?: string | null
          cancel_tonu?: number | null
          canceled_at?: string
          canceled_by?: string | null
          created_at?: string
          id?: string
          order_id?: string
          original_dh_miles?: number | null
          original_driver_price?: number | null
          original_freight_amount?: number | null
          original_loaded_miles?: number | null
          original_notes?: string | null
          original_tonu?: number | null
          original_tonu_driver?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canceled_orders_backup_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canceled_orders_backup_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_materialized_view"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_files: {
        Row: {
          company_id: string
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatcher_daily_driver_counts: {
        Row: {
          created_at: string
          date: string
          dispatcher_id: string
          driver_count: number
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          dispatcher_id: string
          driver_count?: number
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          dispatcher_id?: string
          driver_count?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      dispatcher_notes: {
        Row: {
          color: string
          created_at: string
          created_by: string
          date: string
          dispatcher_id: string
          id: string
          note: string
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          created_by: string
          date: string
          dispatcher_id: string
          id?: string
          note: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          date?: string
          dispatcher_id?: string
          id?: string
          note?: string
          updated_at?: string
        }
        Relationships: []
      }
      dispatcher_status: {
        Row: {
          created_at: string
          dispatcher_id: string
          id: string
          inactive_trucks: Json | null
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          dispatcher_id: string
          id?: string
          inactive_trucks?: Json | null
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          dispatcher_id?: string
          id?: string
          inactive_trucks?: Json | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      driver_drug_tests: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          result: string | null
          tested_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          result?: string | null
          tested_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          result?: string | null
          tested_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_drug_tests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_files: {
        Row: {
          content_type: string | null
          created_at: string
          driver_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          driver_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          driver_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_files_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_performance: {
        Row: {
          created_at: string
          driver_name: string
          gross_tier: string
          id: string
          management_tier: string
          notice: string | null
          safety_tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_name: string
          gross_tier?: string
          id?: string
          management_tier?: string
          notice?: string | null
          safety_tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_name?: string
          gross_tier?: string
          id?: string
          management_tier?: string
          notice?: string | null
          safety_tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_pii_audit_log: {
        Row: {
          access_reason: string | null
          accessed_at: string
          accessed_by: string
          driver_id: string
          fields_accessed: string[] | null
          id: string
          ip_address: unknown
          operation: string
          user_agent: string | null
        }
        Insert: {
          access_reason?: string | null
          accessed_at?: string
          accessed_by: string
          driver_id: string
          fields_accessed?: string[] | null
          id?: string
          ip_address?: unknown
          operation: string
          user_agent?: string | null
        }
        Update: {
          access_reason?: string | null
          accessed_at?: string
          accessed_by?: string
          driver_id?: string
          fields_accessed?: string[] | null
          id?: string
          ip_address?: unknown
          operation?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      driver_sensitive_pii: {
        Row: {
          created_at: string
          driver_id: string
          fein: string | null
          fuel_card_number: string | null
          id: string
          personal_id: string | null
          ssn: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          fein?: string | null
          fuel_card_number?: string | null
          id?: string
          personal_id?: string | null
          ssn?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          fein?: string | null
          fuel_card_number?: string | null
          id?: string
          personal_id?: string | null
          ssn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_sensitive_pii_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_termination_notes: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          note: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_termination_notes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_yard_actions: {
        Row: {
          action_type: string
          comment: string
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          updated_at: string
        }
        Insert: {
          action_type: string
          comment: string
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          comment?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_yard_actions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          agreement_start_date: string | null
          cdl_expiration_date: string | null
          cdl_number: string | null
          clearing_house: string | null
          company_address: string | null
          company_id: string | null
          company_name: string | null
          created_at: string
          dispatcher_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          first_name: string | null
          going_yard: boolean
          hire_date: string | null
          home_address: string | null
          home_city: string | null
          home_latitude: number | null
          home_longitude: number | null
          home_state: string | null
          hos_break_minutes: number | null
          hos_cycle_minutes: number | null
          hos_drive_minutes: number | null
          hos_last_updated: string | null
          hos_shift_minutes: number | null
          hos_status: string | null
          id: string
          is_active: boolean
          is_recovery: boolean | null
          last_name: string | null
          license_number: string | null
          mc_number: string | null
          medical_card_expiration_date: string | null
          mvr_date: string | null
          name: string | null
          phone: string | null
          termination_date: string | null
          two_week_block_date: string | null
          updated_at: string
          weekly_payment: number | null
          weeks_count: number | null
        }
        Insert: {
          agreement_start_date?: string | null
          cdl_expiration_date?: string | null
          cdl_number?: string | null
          clearing_house?: string | null
          company_address?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          dispatcher_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string | null
          going_yard?: boolean
          hire_date?: string | null
          home_address?: string | null
          home_city?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          home_state?: string | null
          hos_break_minutes?: number | null
          hos_cycle_minutes?: number | null
          hos_drive_minutes?: number | null
          hos_last_updated?: string | null
          hos_shift_minutes?: number | null
          hos_status?: string | null
          id?: string
          is_active?: boolean
          is_recovery?: boolean | null
          last_name?: string | null
          license_number?: string | null
          mc_number?: string | null
          medical_card_expiration_date?: string | null
          mvr_date?: string | null
          name?: string | null
          phone?: string | null
          termination_date?: string | null
          two_week_block_date?: string | null
          updated_at?: string
          weekly_payment?: number | null
          weeks_count?: number | null
        }
        Update: {
          agreement_start_date?: string | null
          cdl_expiration_date?: string | null
          cdl_number?: string | null
          clearing_house?: string | null
          company_address?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          dispatcher_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string | null
          going_yard?: boolean
          hire_date?: string | null
          home_address?: string | null
          home_city?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          home_state?: string | null
          hos_break_minutes?: number | null
          hos_cycle_minutes?: number | null
          hos_drive_minutes?: number | null
          hos_last_updated?: string | null
          hos_shift_minutes?: number | null
          hos_status?: string | null
          id?: string
          is_active?: boolean
          is_recovery?: boolean | null
          last_name?: string | null
          license_number?: string | null
          mc_number?: string | null
          medical_card_expiration_date?: string | null
          mvr_date?: string | null
          name?: string | null
          phone?: string | null
          termination_date?: string | null
          two_week_block_date?: string | null
          updated_at?: string
          weekly_payment?: number | null
          weeks_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      geocoding_cache: {
        Row: {
          address: string
          created_at: string | null
          hit_count: number | null
          id: string
          latitude: number
          longitude: number
          updated_at: string | null
        }
        Insert: {
          address: string
          created_at?: string | null
          hit_count?: number | null
          id?: string
          latitude: number
          longitude: number
          updated_at?: string | null
        }
        Update: {
          address?: string
          created_at?: string | null
          hit_count?: number | null
          id?: string
          latitude?: number
          longitude?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      invoice_number_config: {
        Row: {
          created_at: string | null
          current_number: number
          id: string
          last_monday: string
          statement_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_number: number
          id?: string
          last_monday: string
          statement_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_number?: number
          id?: string
          last_monday?: string
          statement_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      lost_day_notes: {
        Row: {
          created_at: string
          date: string
          driver_id: string
          id: string
          note: string | null
          note_type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          date: string
          driver_id: string
          id?: string
          note?: string | null
          note_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          driver_id?: string
          id?: string
          note?: string | null
          note_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lost_day_notes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_files: {
        Row: {
          content_type: string | null
          created_at: string
          file_category: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          order_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_category?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          order_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_category?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          order_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_materialized_view"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          booked_by: string | null
          booked_by_company_id: string | null
          broker_id: string | null
          broker_load_number: string | null
          canceled: boolean
          commodity: string | null
          company_id: string
          created_at: string
          date_change_notes: string | null
          delivery_datetime: string | null
          delivery_end_datetime: string | null
          detention: number | null
          detention_driver: number | null
          dh_miles: number | null
          driver_price: number | null
          driver1_id: string | null
          driver2_id: string | null
          escort_fee: number | null
          escort_fee_broker_paid: boolean | null
          extra_stop: number | null
          extra_stop_driver: number | null
          freight_amount: number | null
          id: string
          internal_load_number: number | null
          invoiced: boolean | null
          is_recovery: boolean | null
          late_fee: number | null
          late_fee_driver: number | null
          layover: number | null
          layover_driver: number | null
          load_number: string
          loaded_miles: number | null
          locked: boolean
          lumper: number | null
          lumper_driver: number | null
          mileage: number | null
          no_tracking_fee: number | null
          no_tracking_fee_driver: number | null
          notes: string | null
          original_detention: number | null
          original_detention_driver: number | null
          original_dh_miles: number | null
          original_driver_price: number | null
          original_driver1_id: string | null
          original_driver2_id: string | null
          original_escort_fee: number | null
          original_escort_fee_broker_paid: boolean | null
          original_extra_stop: number | null
          original_extra_stop_driver: number | null
          original_freight_amount: number | null
          original_late_fee: number | null
          original_late_fee_driver: number | null
          original_layover: number | null
          original_layover_driver: number | null
          original_loaded_miles: number | null
          original_lumper: number | null
          original_lumper_driver: number | null
          original_miles: number | null
          original_no_tracking_fee: number | null
          original_no_tracking_fee_driver: number | null
          original_notes: string | null
          original_other_charges: number | null
          original_other_charges_driver: number | null
          original_tonu: number | null
          original_tonu_driver: number | null
          original_trailer_id: string | null
          original_truck_id: string | null
          original_wrong_address_fee: number | null
          original_wrong_address_fee_driver: number | null
          other_charges: number | null
          other_charges_driver: number | null
          pickup_datetime: string | null
          pickup_end_datetime: string | null
          po_number: string | null
          pu_number: string | null
          recovery_date: string | null
          recovery_driver_price: number | null
          recovery_freight_amount: number | null
          recovery_miles: number | null
          reference_number: string | null
          status: string | null
          tonu: number | null
          tonu_driver: number | null
          trailer_id: string | null
          truck_id: string | null
          updated_at: string
          weight: number | null
          wrong_address_fee: number | null
          wrong_address_fee_driver: number | null
        }
        Insert: {
          booked_by?: string | null
          booked_by_company_id?: string | null
          broker_id?: string | null
          broker_load_number?: string | null
          canceled?: boolean
          commodity?: string | null
          company_id: string
          created_at?: string
          date_change_notes?: string | null
          delivery_datetime?: string | null
          delivery_end_datetime?: string | null
          detention?: number | null
          detention_driver?: number | null
          dh_miles?: number | null
          driver_price?: number | null
          driver1_id?: string | null
          driver2_id?: string | null
          escort_fee?: number | null
          escort_fee_broker_paid?: boolean | null
          extra_stop?: number | null
          extra_stop_driver?: number | null
          freight_amount?: number | null
          id?: string
          internal_load_number?: number | null
          invoiced?: boolean | null
          is_recovery?: boolean | null
          late_fee?: number | null
          late_fee_driver?: number | null
          layover?: number | null
          layover_driver?: number | null
          load_number: string
          loaded_miles?: number | null
          locked?: boolean
          lumper?: number | null
          lumper_driver?: number | null
          mileage?: number | null
          no_tracking_fee?: number | null
          no_tracking_fee_driver?: number | null
          notes?: string | null
          original_detention?: number | null
          original_detention_driver?: number | null
          original_dh_miles?: number | null
          original_driver_price?: number | null
          original_driver1_id?: string | null
          original_driver2_id?: string | null
          original_escort_fee?: number | null
          original_escort_fee_broker_paid?: boolean | null
          original_extra_stop?: number | null
          original_extra_stop_driver?: number | null
          original_freight_amount?: number | null
          original_late_fee?: number | null
          original_late_fee_driver?: number | null
          original_layover?: number | null
          original_layover_driver?: number | null
          original_loaded_miles?: number | null
          original_lumper?: number | null
          original_lumper_driver?: number | null
          original_miles?: number | null
          original_no_tracking_fee?: number | null
          original_no_tracking_fee_driver?: number | null
          original_notes?: string | null
          original_other_charges?: number | null
          original_other_charges_driver?: number | null
          original_tonu?: number | null
          original_tonu_driver?: number | null
          original_trailer_id?: string | null
          original_truck_id?: string | null
          original_wrong_address_fee?: number | null
          original_wrong_address_fee_driver?: number | null
          other_charges?: number | null
          other_charges_driver?: number | null
          pickup_datetime?: string | null
          pickup_end_datetime?: string | null
          po_number?: string | null
          pu_number?: string | null
          recovery_date?: string | null
          recovery_driver_price?: number | null
          recovery_freight_amount?: number | null
          recovery_miles?: number | null
          reference_number?: string | null
          status?: string | null
          tonu?: number | null
          tonu_driver?: number | null
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
          weight?: number | null
          wrong_address_fee?: number | null
          wrong_address_fee_driver?: number | null
        }
        Update: {
          booked_by?: string | null
          booked_by_company_id?: string | null
          broker_id?: string | null
          broker_load_number?: string | null
          canceled?: boolean
          commodity?: string | null
          company_id?: string
          created_at?: string
          date_change_notes?: string | null
          delivery_datetime?: string | null
          delivery_end_datetime?: string | null
          detention?: number | null
          detention_driver?: number | null
          dh_miles?: number | null
          driver_price?: number | null
          driver1_id?: string | null
          driver2_id?: string | null
          escort_fee?: number | null
          escort_fee_broker_paid?: boolean | null
          extra_stop?: number | null
          extra_stop_driver?: number | null
          freight_amount?: number | null
          id?: string
          internal_load_number?: number | null
          invoiced?: boolean | null
          is_recovery?: boolean | null
          late_fee?: number | null
          late_fee_driver?: number | null
          layover?: number | null
          layover_driver?: number | null
          load_number?: string
          loaded_miles?: number | null
          locked?: boolean
          lumper?: number | null
          lumper_driver?: number | null
          mileage?: number | null
          no_tracking_fee?: number | null
          no_tracking_fee_driver?: number | null
          notes?: string | null
          original_detention?: number | null
          original_detention_driver?: number | null
          original_dh_miles?: number | null
          original_driver_price?: number | null
          original_driver1_id?: string | null
          original_driver2_id?: string | null
          original_escort_fee?: number | null
          original_escort_fee_broker_paid?: boolean | null
          original_extra_stop?: number | null
          original_extra_stop_driver?: number | null
          original_freight_amount?: number | null
          original_late_fee?: number | null
          original_late_fee_driver?: number | null
          original_layover?: number | null
          original_layover_driver?: number | null
          original_loaded_miles?: number | null
          original_lumper?: number | null
          original_lumper_driver?: number | null
          original_miles?: number | null
          original_no_tracking_fee?: number | null
          original_no_tracking_fee_driver?: number | null
          original_notes?: string | null
          original_other_charges?: number | null
          original_other_charges_driver?: number | null
          original_tonu?: number | null
          original_tonu_driver?: number | null
          original_trailer_id?: string | null
          original_truck_id?: string | null
          original_wrong_address_fee?: number | null
          original_wrong_address_fee_driver?: number | null
          other_charges?: number | null
          other_charges_driver?: number | null
          pickup_datetime?: string | null
          pickup_end_datetime?: string | null
          po_number?: string | null
          pu_number?: string | null
          recovery_date?: string | null
          recovery_driver_price?: number | null
          recovery_freight_amount?: number | null
          recovery_miles?: number | null
          reference_number?: string | null
          status?: string | null
          tonu?: number | null
          tonu_driver?: number | null
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
          weight?: number | null
          wrong_address_fee?: number | null
          wrong_address_fee_driver?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_booked_by_company_id_fkey"
            columns: ["booked_by_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver1_id_fkey"
            columns: ["driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver2_id_fkey"
            columns: ["driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_driver1_id_fkey"
            columns: ["original_driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_driver2_id_fkey"
            columns: ["original_driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_trailer_id_fkey"
            columns: ["original_trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_truck_id_fkey"
            columns: ["original_truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_drops: {
        Row: {
          address: string
          arrived_at: string | null
          checked_out_at: string | null
          city: string | null
          company_name: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          datetime: string | null
          end_datetime: string | null
          going_to_at: string | null
          id: string
          order_id: string
          sequence_number: number | null
          special_instructions: string | null
          state: string | null
          type: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address: string
          arrived_at?: string | null
          checked_out_at?: string | null
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          datetime?: string | null
          end_datetime?: string | null
          going_to_at?: string | null
          id?: string
          order_id: string
          sequence_number?: number | null
          special_instructions?: string | null
          state?: string | null
          type: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string
          arrived_at?: string | null
          checked_out_at?: string | null
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          datetime?: string | null
          end_datetime?: string | null
          going_to_at?: string | null
          id?: string
          order_id?: string
          sequence_number?: number | null
          special_instructions?: string | null
          state?: string | null
          type?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pickup_drops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_drops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_materialized_view"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          ext: string | null
          full_name: string | null
          id: string
          office: Database["public"]["Enums"]["office_location"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          ext?: string | null
          full_name?: string | null
          id?: string
          office?: Database["public"]["Enums"]["office_location"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          ext?: string | null
          full_name?: string | null
          id?: string
          office?: Database["public"]["Enums"]["office_location"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recovery_history: {
        Row: {
          created_at: string
          id: string
          order_id: string
          original_dispatcher_id: string | null
          original_driver1_id: string | null
          original_driver2_id: string | null
          original_trailer_id: string | null
          original_truck_id: string | null
          recovery_date: string
          recovery_driver1_id: string | null
          recovery_driver2_id: string | null
          recovery_trailer_id: string | null
          recovery_truck_id: string | null
          reverted_at: string | null
          reverted_by: string | null
          trailers_swapped: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          original_dispatcher_id?: string | null
          original_driver1_id?: string | null
          original_driver2_id?: string | null
          original_trailer_id?: string | null
          original_truck_id?: string | null
          recovery_date?: string
          recovery_driver1_id?: string | null
          recovery_driver2_id?: string | null
          recovery_trailer_id?: string | null
          recovery_truck_id?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          trailers_swapped?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          original_dispatcher_id?: string | null
          original_driver1_id?: string | null
          original_driver2_id?: string | null
          original_trailer_id?: string | null
          original_truck_id?: string | null
          recovery_date?: string
          recovery_driver1_id?: string | null
          recovery_driver2_id?: string | null
          recovery_trailer_id?: string | null
          recovery_truck_id?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          trailers_swapped?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_materialized_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_original_dispatcher_id_fkey"
            columns: ["original_dispatcher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "recovery_history_original_driver1_id_fkey"
            columns: ["original_driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_original_driver2_id_fkey"
            columns: ["original_driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_original_trailer_id_fkey"
            columns: ["original_trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_original_truck_id_fkey"
            columns: ["original_truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_recovery_driver1_id_fkey"
            columns: ["recovery_driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_recovery_driver2_id_fkey"
            columns: ["recovery_driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_recovery_trailer_id_fkey"
            columns: ["recovery_trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_recovery_truck_id_fkey"
            columns: ["recovery_truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_history_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      route_cache: {
        Row: {
          created_at: string | null
          distance_meters: number | null
          distance_miles: number
          duration_seconds: number | null
          end_lat: number
          end_lon: number
          hit_count: number | null
          id: string
          start_lat: number
          start_lon: number
        }
        Insert: {
          created_at?: string | null
          distance_meters?: number | null
          distance_miles: number
          duration_seconds?: number | null
          end_lat: number
          end_lon: number
          hit_count?: number | null
          id?: string
          start_lat: number
          start_lon: number
        }
        Update: {
          created_at?: string | null
          distance_meters?: number | null
          distance_miles?: number
          duration_seconds?: number | null
          end_lat?: number
          end_lon?: number
          hit_count?: number | null
          id?: string
          start_lat?: number
          start_lon?: number
        }
        Relationships: []
      }
      trailer_files: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          trailer_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          trailer_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          trailer_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_files_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
        ]
      }
      trailers: {
        Row: {
          capacity: number | null
          created_at: string
          dot_inspection_date: string | null
          id: string
          insurance_expiration_date: string | null
          plate_expiration_date: string | null
          status: string | null
          trailer_number: string
          trailer_type: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          dot_inspection_date?: string | null
          id?: string
          insurance_expiration_date?: string | null
          plate_expiration_date?: string | null
          status?: string | null
          trailer_number: string
          trailer_type?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          dot_inspection_date?: string | null
          id?: string
          insurance_expiration_date?: string | null
          plate_expiration_date?: string | null
          status?: string | null
          trailer_number?: string
          trailer_type?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: []
      }
      truck_files: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          truck_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          truck_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          truck_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_files_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_locations: {
        Row: {
          created_at: string
          heading: number | null
          id: string
          latitude: number
          location_timestamp: string
          longitude: number
          samsara_vehicle_id: string | null
          samsara_vehicle_name: string | null
          speed: number | null
          truck_id: string | null
          truck_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          heading?: number | null
          id?: string
          latitude: number
          location_timestamp: string
          longitude: number
          samsara_vehicle_id?: string | null
          samsara_vehicle_name?: string | null
          speed?: number | null
          truck_id?: string | null
          truck_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          heading?: number | null
          id?: string
          latitude?: number
          location_timestamp?: string
          longitude?: number
          samsara_vehicle_id?: string | null
          samsara_vehicle_name?: string | null
          speed?: number | null
          truck_id?: string | null
          truck_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "truck_locations_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_note_history: {
        Row: {
          created_at: string
          driver_id: string
          edited_at: string
          edited_by: string | null
          id: string
          note: string | null
          truck_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          edited_at?: string
          edited_by?: string | null
          id?: string
          note?: string | null
          truck_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          edited_at?: string
          edited_by?: string | null
          id?: string
          note?: string | null
          truck_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_note_history_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_note_history_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "truck_note_history_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_notes: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          note: string | null
          truck_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          note?: string | null
          truck_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          note?: string | null
          truck_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_notes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      trucks: {
        Row: {
          company_id: string | null
          created_at: string
          dispatcher_id: string | null
          dot_inspection_date: string | null
          driver1_id: string | null
          driver2_id: string | null
          id: string
          insurance_expiration_date: string | null
          ipass: string | null
          left_by_driver_id: string | null
          miles_away: number | null
          model: string | null
          needs_recovery: boolean | null
          plate_expiration_date: string | null
          status: string | null
          trailer_id: string | null
          truck_number: string
          truck_type: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          dispatcher_id?: string | null
          dot_inspection_date?: string | null
          driver1_id?: string | null
          driver2_id?: string | null
          id?: string
          insurance_expiration_date?: string | null
          ipass?: string | null
          left_by_driver_id?: string | null
          miles_away?: number | null
          model?: string | null
          needs_recovery?: boolean | null
          plate_expiration_date?: string | null
          status?: string | null
          trailer_id?: string | null
          truck_number: string
          truck_type?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          dispatcher_id?: string | null
          dot_inspection_date?: string | null
          driver1_id?: string | null
          driver2_id?: string | null
          id?: string
          insurance_expiration_date?: string | null
          ipass?: string | null
          left_by_driver_id?: string | null
          miles_away?: number | null
          model?: string | null
          needs_recovery?: boolean | null
          plate_expiration_date?: string | null
          status?: string | null
          trailer_id?: string | null
          truck_number?: string
          truck_type?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trucks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_dispatcher_id_fkey"
            columns: ["dispatcher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trucks_driver1_id_fkey"
            columns: ["driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_driver2_id_fkey"
            columns: ["driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_left_by_driver_id_fkey"
            columns: ["left_by_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      orders_materialized_view: {
        Row: {
          booked_by: string | null
          booked_by_company_id: string | null
          booked_by_company_name: string | null
          broker_address: string | null
          broker_id: string | null
          broker_load_number: string | null
          broker_mc_number: string | null
          broker_name: string | null
          canceled: boolean | null
          commodity: string | null
          company_id: string | null
          company_name: string | null
          created_at: string | null
          date_change_notes: string | null
          delivery_datetime: string | null
          delivery_end_datetime: string | null
          detention: number | null
          detention_driver: number | null
          dh_miles: number | null
          driver_price: number | null
          driver1_id: string | null
          driver1_name: string | null
          driver2_id: string | null
          driver2_name: string | null
          escort_fee: number | null
          escort_fee_broker_paid: boolean | null
          extra_stop: number | null
          extra_stop_driver: number | null
          freight_amount: number | null
          id: string | null
          internal_load_number: number | null
          invoiced: boolean | null
          is_recovery: boolean | null
          late_fee: number | null
          late_fee_driver: number | null
          layover: number | null
          layover_driver: number | null
          load_number: string | null
          loaded_miles: number | null
          locked: boolean | null
          lumper: number | null
          lumper_driver: number | null
          mileage: number | null
          no_tracking_fee: number | null
          no_tracking_fee_driver: number | null
          notes: string | null
          order_files: Json | null
          original_detention: number | null
          original_detention_driver: number | null
          original_dh_miles: number | null
          original_driver_price: number | null
          original_driver1_id: string | null
          original_driver1_name: string | null
          original_driver2_id: string | null
          original_driver2_name: string | null
          original_escort_fee: number | null
          original_escort_fee_broker_paid: boolean | null
          original_extra_stop: number | null
          original_extra_stop_driver: number | null
          original_freight_amount: number | null
          original_late_fee: number | null
          original_late_fee_driver: number | null
          original_layover: number | null
          original_layover_driver: number | null
          original_loaded_miles: number | null
          original_lumper: number | null
          original_lumper_driver: number | null
          original_miles: number | null
          original_no_tracking_fee: number | null
          original_no_tracking_fee_driver: number | null
          original_notes: string | null
          original_other_charges: number | null
          original_other_charges_driver: number | null
          original_tonu: number | null
          original_tonu_driver: number | null
          original_trailer_id: string | null
          original_trailer_number: string | null
          original_truck_id: string | null
          original_truck_number: string | null
          original_wrong_address_fee: number | null
          original_wrong_address_fee_driver: number | null
          other_charges: number | null
          other_charges_driver: number | null
          pickup_datetime: string | null
          pickup_drops: Json | null
          pickup_end_datetime: string | null
          po_number: string | null
          pu_number: string | null
          recovery_date: string | null
          recovery_driver_price: number | null
          recovery_freight_amount: number | null
          recovery_miles: number | null
          reference_number: string | null
          status: string | null
          tonu: number | null
          tonu_driver: number | null
          trailer_id: string | null
          trailer_number: string | null
          truck_company_id: string | null
          truck_company_name: string | null
          truck_id: string | null
          truck_number: string | null
          updated_at: string | null
          weight: number | null
          wrong_address_fee: number | null
          wrong_address_fee_driver: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_booked_by_company_id_fkey"
            columns: ["booked_by_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver1_id_fkey"
            columns: ["driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver2_id_fkey"
            columns: ["driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_driver1_id_fkey"
            columns: ["original_driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_driver2_id_fkey"
            columns: ["original_driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_trailer_id_fkey"
            columns: ["original_trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_truck_id_fkey"
            columns: ["original_truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_company_id_fkey"
            columns: ["truck_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_order_with_unique_load_number: {
        Args: { order_data: Json }
        Returns: Json
      }
      get_assignment_history: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: {
          change_type: string
          changed_at: string
          changed_by: string
          changed_by_name: string
          driver1_id: string
          driver1_name: string
          driver2_id: string
          driver2_name: string
          id: string
          trailer_id: string
          trailer_number: string
          truck_id: string
          truck_number: string
        }[]
      }
      get_latest_truck_locations: {
        Args: never
        Returns: {
          heading: number
          latitude: number
          location_timestamp: string
          longitude: number
          samsara_vehicle_id: string
          samsara_vehicle_name: string
          speed: number
          truck_id: string
          truck_number: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_pii_view: {
        Args: {
          p_driver_id: string
          p_fields_accessed: string[]
          p_reason?: string
        }
        Returns: undefined
      }
      sign_out_all_users: { Args: never; Returns: Json }
    }
    Enums: {
      app_role:
        | "dispatch"
        | "admin"
        | "manager"
        | "driver"
        | "safety"
        | "supervisor"
        | "accounting"
        | "afterhours"
        | "maintenance"
        | "chicago_management"
      office_location: "Čačak" | "KRAGUJEVAC" | "BEOGRAD" | "Recovery"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "dispatch",
        "admin",
        "manager",
        "driver",
        "safety",
        "supervisor",
        "accounting",
        "afterhours",
        "maintenance",
        "chicago_management",
      ],
      office_location: ["Čačak", "KRAGUJEVAC", "BEOGRAD", "Recovery"],
    },
  },
} as const
