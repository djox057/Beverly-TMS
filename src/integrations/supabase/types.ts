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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      afterhours_assignments: {
        Row: {
          afterhours_user_id: string
          assigned_at: string
          driver_id: string
          id: string
          scheduled_date: string | null
        }
        Insert: {
          afterhours_user_id: string
          assigned_at?: string
          driver_id: string
          id?: string
          scheduled_date?: string | null
        }
        Update: {
          afterhours_user_id?: string
          assigned_at?: string
          driver_id?: string
          id?: string
          scheduled_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "afterhours_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      afterhours_cron_log: {
        Row: {
          auth_method: string | null
          chicago_date: string
          completed_at: string | null
          error_message: string | null
          expected_count: number | null
          function_name: string
          id: number
          invocation_id: string
          payload: Json | null
          processed_count: number | null
          started_at: string
          success: boolean | null
        }
        Insert: {
          auth_method?: string | null
          chicago_date: string
          completed_at?: string | null
          error_message?: string | null
          expected_count?: number | null
          function_name: string
          id?: number
          invocation_id: string
          payload?: Json | null
          processed_count?: number | null
          started_at?: string
          success?: boolean | null
        }
        Update: {
          auth_method?: string | null
          chicago_date?: string
          completed_at?: string | null
          error_message?: string | null
          expected_count?: number | null
          function_name?: string
          id?: number
          invocation_id?: string
          payload?: Json | null
          processed_count?: number | null
          started_at?: string
          success?: boolean | null
        }
        Relationships: []
      }
      afterhours_schedule: {
        Row: {
          created_at: string
          created_by: string | null
          dispatcher_name: string | null
          id: string
          scheduled_date: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dispatcher_name?: string | null
          id?: string
          scheduled_date: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dispatcher_name?: string | null
          id?: string
          scheduled_date?: string
          user_id?: string | null
        }
        Relationships: []
      }
      afterhours_sms_send_log: {
        Row: {
          assignment_id: string
          chicago_date: string
          driver_id: string
          error_message: string | null
          id: number
          invocation_id: string | null
          rc_message_id: string | null
          sent_at: string
          success: boolean
        }
        Insert: {
          assignment_id: string
          chicago_date: string
          driver_id: string
          error_message?: string | null
          id?: number
          invocation_id?: string | null
          rc_message_id?: string | null
          sent_at?: string
          success?: boolean
        }
        Update: {
          assignment_id?: string
          chicago_date?: string
          driver_id?: string
          error_message?: string | null
          id?: number
          invocation_id?: string | null
          rc_message_id?: string | null
          sent_at?: string
          success?: boolean
        }
        Relationships: []
      }
      analytics_calculation_log: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          orders_processed: number | null
          period_start: string
          period_type: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          orders_processed?: number | null
          period_start: string
          period_type: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          orders_processed?: number | null
          period_start?: string
          period_type?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      analytics_dispatcher_period: {
        Row: {
          avg_trucks: number
          created_at: string
          dispatcher_cut: number
          dispatcher_cut_percent: number
          dispatcher_id: string
          dispatcher_name: string
          id: string
          last_calculated_at: string
          office: string | null
          order_count: number
          period_end: string
          period_start: string
          period_type: string
          rate_per_mile: number
          total_driver_rate: number
          total_freight: number
          total_miles: number
          updated_at: string
        }
        Insert: {
          avg_trucks?: number
          created_at?: string
          dispatcher_cut?: number
          dispatcher_cut_percent?: number
          dispatcher_id: string
          dispatcher_name: string
          id?: string
          last_calculated_at?: string
          office?: string | null
          order_count?: number
          period_end: string
          period_start: string
          period_type: string
          rate_per_mile?: number
          total_driver_rate?: number
          total_freight?: number
          total_miles?: number
          updated_at?: string
        }
        Update: {
          avg_trucks?: number
          created_at?: string
          dispatcher_cut?: number
          dispatcher_cut_percent?: number
          dispatcher_id?: string
          dispatcher_name?: string
          id?: string
          last_calculated_at?: string
          office?: string | null
          order_count?: number
          period_end?: string
          period_start?: string
          period_type?: string
          rate_per_mile?: number
          total_driver_rate?: number
          total_freight?: number
          total_miles?: number
          updated_at?: string
        }
        Relationships: []
      }
      analytics_locked_daily: {
        Row: {
          date: string
          date_type: string
          entity_id: string
          entity_name: string | null
          entity_type: string
          id: string
          is_company_driver: boolean | null
          order_count: number | null
          total_dh_miles: number | null
          total_driver_pay: number | null
          total_driver_pay_effective: number | null
          total_freight: number | null
          total_miles: number | null
          updated_at: string | null
        }
        Insert: {
          date: string
          date_type: string
          entity_id: string
          entity_name?: string | null
          entity_type: string
          id?: string
          is_company_driver?: boolean | null
          order_count?: number | null
          total_dh_miles?: number | null
          total_driver_pay?: number | null
          total_driver_pay_effective?: number | null
          total_freight?: number | null
          total_miles?: number | null
          updated_at?: string | null
        }
        Update: {
          date?: string
          date_type?: string
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          id?: string
          is_company_driver?: boolean | null
          order_count?: number | null
          total_dh_miles?: number | null
          total_driver_pay?: number | null
          total_driver_pay_effective?: number | null
          total_freight?: number | null
          total_miles?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      analytics_locked_daily_staging: {
        Row: {
          date: string
          date_type: string
          entity_id: string
          entity_name: string | null
          entity_type: string
          id: string
          is_company_driver: boolean | null
          order_count: number | null
          total_dh_miles: number | null
          total_driver_pay: number | null
          total_driver_pay_effective: number | null
          total_freight: number | null
          total_miles: number | null
          updated_at: string | null
        }
        Insert: {
          date: string
          date_type: string
          entity_id: string
          entity_name?: string | null
          entity_type: string
          id?: string
          is_company_driver?: boolean | null
          order_count?: number | null
          total_dh_miles?: number | null
          total_driver_pay?: number | null
          total_driver_pay_effective?: number | null
          total_freight?: number | null
          total_miles?: number | null
          updated_at?: string | null
        }
        Update: {
          date?: string
          date_type?: string
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          id?: string
          is_company_driver?: boolean | null
          order_count?: number | null
          total_dh_miles?: number | null
          total_driver_pay?: number | null
          total_driver_pay_effective?: number | null
          total_freight?: number | null
          total_miles?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      analytics_period_totals: {
        Row: {
          created_at: string
          id: string
          last_calculated_at: string
          office: string | null
          order_count: number
          period_end: string
          period_start: string
          period_type: string
          rate_per_mile: number
          total_cut: number
          total_cut_percent: number
          total_driver_rate: number
          total_freight: number
          total_miles: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_calculated_at?: string
          office?: string | null
          order_count?: number
          period_end: string
          period_start: string
          period_type: string
          rate_per_mile?: number
          total_cut?: number
          total_cut_percent?: number
          total_driver_rate?: number
          total_freight?: number
          total_miles?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_calculated_at?: string
          office?: string | null
          order_count?: number
          period_end?: string
          period_start?: string
          period_type?: string
          rate_per_mile?: number
          total_cut?: number
          total_cut_percent?: number
          total_driver_rate?: number
          total_freight?: number
          total_miles?: number
          updated_at?: string
        }
        Relationships: []
      }
      archive_version: {
        Row: {
          id: string
          updated_at: string
          version: number
        }
        Insert: {
          id?: string
          updated_at?: string
          version?: number
        }
        Update: {
          id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      archived_orders_metadata: {
        Row: {
          created_at: string
          id: string
          last_updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      assignment_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          changed_by_name_snapshot: string | null
          created_at: string
          dispatcher_id: string | null
          dispatcher_name_snapshot: string | null
          driver1_id: string | null
          driver2_id: string | null
          id: string
          old_dispatcher_id: string | null
          old_dispatcher_name_snapshot: string | null
          old_driver1_id: string | null
          old_driver2_id: string | null
          old_trailer_id: string | null
          old_truck_id: string | null
          reason: string | null
          trailer_id: string | null
          truck_id: string | null
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name_snapshot?: string | null
          created_at?: string
          dispatcher_id?: string | null
          dispatcher_name_snapshot?: string | null
          driver1_id?: string | null
          driver2_id?: string | null
          id?: string
          old_dispatcher_id?: string | null
          old_dispatcher_name_snapshot?: string | null
          old_driver1_id?: string | null
          old_driver2_id?: string | null
          old_trailer_id?: string | null
          old_truck_id?: string | null
          reason?: string | null
          trailer_id?: string | null
          truck_id?: string | null
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name_snapshot?: string | null
          created_at?: string
          dispatcher_id?: string | null
          dispatcher_name_snapshot?: string | null
          driver1_id?: string | null
          driver2_id?: string | null
          id?: string
          old_dispatcher_id?: string | null
          old_dispatcher_name_snapshot?: string | null
          old_driver1_id?: string | null
          old_driver2_id?: string | null
          old_trailer_id?: string | null
          old_truck_id?: string | null
          reason?: string | null
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
            foreignKeyName: "assignment_history_old_driver1_id_fkey"
            columns: ["old_driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_history_old_driver2_id_fkey"
            columns: ["old_driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_history_old_trailer_id_fkey"
            columns: ["old_trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_history_old_truck_id_fkey"
            columns: ["old_truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
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
          credit_limit_amount: number | null
          credit_status: string
          credit_used_amount: number | null
          id: string
          mc_number: string
          name: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          credit_limit_amount?: number | null
          credit_status?: string
          credit_used_amount?: number | null
          id?: string
          mc_number: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          credit_limit_amount?: number | null
          credit_status?: string
          credit_used_amount?: number | null
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
        ]
      }
      circuit_breaker_state: {
        Row: {
          circuit_open_until: string | null
          consecutive_failures: number
          function_name: string
          last_success_at: string | null
          updated_at: string
        }
        Insert: {
          circuit_open_until?: string | null
          consecutive_failures?: number
          function_name: string
          last_success_at?: string | null
          updated_at?: string
        }
        Update: {
          circuit_open_until?: string | null
          consecutive_failures?: number
          function_name?: string
          last_success_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
      daily_driver_stats: {
        Row: {
          date: string
          dispatcher_id: string
          driver_id: string
          has_home_time: boolean | null
          has_lost_day: boolean | null
          has_reschedule: boolean | null
          id: string
          lost_day_note: string | null
          office: string
          recorded_at: string | null
          reschedule_order_id: string | null
        }
        Insert: {
          date: string
          dispatcher_id: string
          driver_id: string
          has_home_time?: boolean | null
          has_lost_day?: boolean | null
          has_reschedule?: boolean | null
          id?: string
          lost_day_note?: string | null
          office: string
          recorded_at?: string | null
          reschedule_order_id?: string | null
        }
        Update: {
          date?: string
          dispatcher_id?: string
          driver_id?: string
          has_home_time?: boolean | null
          has_lost_day?: boolean | null
          has_reschedule?: boolean | null
          id?: string
          lost_day_note?: string | null
          office?: string
          recorded_at?: string | null
          reschedule_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_driver_stats_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_driver_stats_reschedule_order_id_fkey"
            columns: ["reschedule_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_entries: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          date: string
          dispatcher_name: string | null
          driver_name: string | null
          home_date: string | null
          id: string
          note: string | null
          office: string | null
          truck: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          dispatcher_name?: string | null
          driver_name?: string | null
          home_date?: string | null
          id?: string
          note?: string | null
          office?: string | null
          truck?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          dispatcher_name?: string | null
          driver_name?: string | null
          home_date?: string | null
          id?: string
          note?: string | null
          office?: string | null
          truck?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_report_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      deleted_drivers: {
        Row: {
          agreement_start_date: string | null
          cdl_expiration_date: string | null
          cdl_number: string | null
          cents_per_mile: number | null
          clearing_house: string | null
          company_address: string | null
          company_id: string | null
          company_name: string | null
          created_at: string
          deleted_at: string
          deleted_by: string | null
          dispatcher_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          first_name: string | null
          going_yard: boolean | null
          hire_date: string | null
          home_address: string | null
          home_city: string | null
          home_latitude: number | null
          home_longitude: number | null
          home_state: string | null
          id: string
          is_active: boolean | null
          is_checked_for_termination: boolean | null
          is_company_driver: boolean | null
          is_recovery: boolean | null
          last_name: string | null
          license_number: string | null
          mc_number: string | null
          medical_card_expiration_date: string | null
          mvr_date: string | null
          name: string | null
          phone: string | null
          random_drug_test_date: string | null
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
          cents_per_mile?: number | null
          clearing_house?: string | null
          company_address?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          dispatcher_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string | null
          going_yard?: boolean | null
          hire_date?: string | null
          home_address?: string | null
          home_city?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          home_state?: string | null
          id: string
          is_active?: boolean | null
          is_checked_for_termination?: boolean | null
          is_company_driver?: boolean | null
          is_recovery?: boolean | null
          last_name?: string | null
          license_number?: string | null
          mc_number?: string | null
          medical_card_expiration_date?: string | null
          mvr_date?: string | null
          name?: string | null
          phone?: string | null
          random_drug_test_date?: string | null
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
          cents_per_mile?: number | null
          clearing_house?: string | null
          company_address?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          dispatcher_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string | null
          going_yard?: boolean | null
          hire_date?: string | null
          home_address?: string | null
          home_city?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          home_state?: string | null
          id?: string
          is_active?: boolean | null
          is_checked_for_termination?: boolean | null
          is_company_driver?: boolean | null
          is_recovery?: boolean | null
          last_name?: string | null
          license_number?: string | null
          mc_number?: string | null
          medical_card_expiration_date?: string | null
          mvr_date?: string | null
          name?: string | null
          phone?: string | null
          random_drug_test_date?: string | null
          termination_date?: string | null
          two_week_block_date?: string | null
          updated_at?: string
          weekly_payment?: number | null
          weeks_count?: number | null
        }
        Relationships: []
      }
      deleted_trailers: {
        Row: {
          capacity: number | null
          created_at: string
          deleted_at: string
          deleted_by: string | null
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
          deleted_at?: string
          deleted_by?: string | null
          dot_inspection_date?: string | null
          id: string
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
          deleted_at?: string
          deleted_by?: string | null
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
      deleted_trucks: {
        Row: {
          company_id: string | null
          created_at: string
          deleted_at: string
          deleted_by: string | null
          dispatcher_id: string | null
          dot_inspection_date: string | null
          id: string
          insurance_expiration_date: string | null
          ipass: string | null
          model: string | null
          plate_expiration_date: string | null
          status: string | null
          truck_number: string
          truck_type: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          dispatcher_id?: string | null
          dot_inspection_date?: string | null
          id: string
          insurance_expiration_date?: string | null
          ipass?: string | null
          model?: string | null
          plate_expiration_date?: string | null
          status?: string | null
          truck_number: string
          truck_type?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          dispatcher_id?: string | null
          dot_inspection_date?: string | null
          id?: string
          insurance_expiration_date?: string | null
          ipass?: string | null
          model?: string | null
          plate_expiration_date?: string | null
          status?: string | null
          truck_number?: string
          truck_type?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: []
      }
      dispatcher_daily_driver_counts: {
        Row: {
          created_at: string
          date: string
          dispatcher_id: string
          driver_count: number
          id: string
          truck_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          dispatcher_id: string
          driver_count?: number
          id?: string
          truck_count: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          dispatcher_id?: string
          driver_count?: number
          id?: string
          truck_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      dispatcher_daily_empty_days: {
        Row: {
          created_at: string | null
          date: string
          dispatcher_id: string
          empty_day_count: number
          id: string
          office: string
        }
        Insert: {
          created_at?: string | null
          date: string
          dispatcher_id: string
          empty_day_count?: number
          id?: string
          office: string
        }
        Update: {
          created_at?: string | null
          date?: string
          dispatcher_id?: string
          empty_day_count?: number
          id?: string
          office?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatcher_daily_empty_days_dispatcher_id_fkey"
            columns: ["dispatcher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      dispatcher_monthly_bonuses: {
        Row: {
          bonus_amount: number
          bonus_rank: number
          created_at: string
          created_by: string | null
          dispatcher_id: string
          id: string
          month: string
          updated_at: string
        }
        Insert: {
          bonus_amount: number
          bonus_rank: number
          created_at?: string
          created_by?: string | null
          dispatcher_id: string
          id?: string
          month: string
          updated_at?: string
        }
        Update: {
          bonus_amount?: number
          bonus_rank?: number
          created_at?: string
          created_by?: string | null
          dispatcher_id?: string
          id?: string
          month?: string
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
      dispatcher_off_duty_days: {
        Row: {
          created_at: string
          created_by: string | null
          dispatcher_id: string
          dispatcher_name: string | null
          id: string
          off_duty_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dispatcher_id: string
          dispatcher_name?: string | null
          id?: string
          off_duty_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dispatcher_id?: string
          dispatcher_name?: string | null
          id?: string
          off_duty_date?: string
        }
        Relationships: []
      }
      dispatcher_salary_payments: {
        Row: {
          additionals: Json | null
          calculated_salary: number | null
          created_at: string
          dispatcher_name: string | null
          id: string
          is_checked: boolean
          lost_days: number | null
          month: string
          paid_amount: number
          paid_at: string | null
          paid_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          additionals?: Json | null
          calculated_salary?: number | null
          created_at?: string
          dispatcher_name?: string | null
          id?: string
          is_checked?: boolean
          lost_days?: number | null
          month: string
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          additionals?: Json | null
          calculated_salary?: number | null
          created_at?: string
          dispatcher_name?: string | null
          id?: string
          is_checked?: boolean
          lost_days?: number | null
          month?: string
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dispatcher_sick_days: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          sick_date: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          sick_date: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          sick_date?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      dispatcher_status: {
        Row: {
          created_at: string
          dispatcher_id: string | null
          id: string
          inactive_trucks: Json | null
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          dispatcher_id?: string | null
          id?: string
          inactive_trucks?: Json | null
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          dispatcher_id?: string | null
          id?: string
          inactive_trucks?: Json | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      dispatcher_supervisors: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          dispatcher_id: string
          id: string
          supervisor_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          dispatcher_id: string
          id?: string
          supervisor_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          dispatcher_id?: string
          id?: string
          supervisor_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_cash_advances: {
        Row: {
          amount: number
          created_at: string
          driver_id: string
          id: string
          requested_at: string
          requested_by: string | null
          resend_email_id: string | null
          truck_number: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          driver_id: string
          id?: string
          requested_at?: string
          requested_by?: string | null
          resend_email_id?: string | null
          truck_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          driver_id?: string
          id?: string
          requested_at?: string
          requested_by?: string | null
          resend_email_id?: string | null
          truck_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_cash_advances_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_company_history: {
        Row: {
          changed_by: string | null
          changed_by_name_snapshot: string | null
          company_id: string | null
          company_name_snapshot: string | null
          created_at: string
          driver_id: string
          ended_at: string | null
          id: string
          started_at: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name_snapshot?: string | null
          company_id?: string | null
          company_name_snapshot?: string | null
          created_at?: string
          driver_id: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name_snapshot?: string | null
          company_id?: string | null
          company_name_snapshot?: string | null
          created_at?: string
          driver_id?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_company_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_company_history_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
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
      driver_email_log: {
        Row: {
          created_at: string
          driver_id: string
          email_type: string
          id: string
          order_id: string
          sent_at: string
          sent_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          email_type?: string
          id?: string
          order_id: string
          sent_at?: string
          sent_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          email_type?: string
          id?: string
          order_id?: string
          sent_at?: string
          sent_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      driver_expenses: {
        Row: {
          amount: number
          cash_advance_id: string | null
          created_at: string
          driver_id: string
          expense_date: string | null
          expense_type: string
          explanation: string
          id: string
          is_fixed: boolean
          name: string | null
          notice_1: string | null
          notice_2: string | null
          paid_amount: number | null
          paid_date: string | null
          repair_id: string | null
          status: string
          trailer_number: string | null
          truck_number: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cash_advance_id?: string | null
          created_at?: string
          driver_id: string
          expense_date?: string | null
          expense_type?: string
          explanation: string
          id?: string
          is_fixed?: boolean
          name?: string | null
          notice_1?: string | null
          notice_2?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          repair_id?: string | null
          status?: string
          trailer_number?: string | null
          truck_number?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cash_advance_id?: string | null
          created_at?: string
          driver_id?: string
          expense_date?: string | null
          expense_type?: string
          explanation?: string
          id?: string
          is_fixed?: boolean
          name?: string | null
          notice_1?: string | null
          notice_2?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          repair_id?: string | null
          status?: string
          trailer_number?: string | null
          truck_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_expenses_cash_advance_id_fkey"
            columns: ["cash_advance_id"]
            isOneToOne: false
            referencedRelation: "driver_cash_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_expenses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_expenses_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
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
      driver_problems: {
        Row: {
          created_at: string
          created_by: string | null
          dispatcher_name: string | null
          driver_id: string
          id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          truck_number: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dispatcher_name?: string | null
          driver_id: string
          id?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          truck_number?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dispatcher_name?: string | null
          driver_id?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          truck_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_problems_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
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
      driver_weekly_salaries: {
        Row: {
          amount: number
          created_at: string
          driver_id: string
          id: string
          updated_at: string
          week_date: string
        }
        Insert: {
          amount?: number
          created_at?: string
          driver_id: string
          id?: string
          updated_at?: string
          week_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          driver_id?: string
          id?: string
          updated_at?: string
          week_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_weekly_salaries_driver_id_fkey"
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
          arrival_datetime: string | null
          comment: string
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          is_checked: boolean | null
          is_team: boolean
          truck_number: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          arrival_datetime?: string | null
          comment: string
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          is_checked?: boolean | null
          is_team?: boolean
          truck_number?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          arrival_datetime?: string | null
          comment?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          is_checked?: boolean | null
          is_team?: boolean
          truck_number?: string | null
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
          cents_per_mile: number | null
          citizen: boolean
          clearing_house: string | null
          company_address: string | null
          company_id: string | null
          company_name: string | null
          created_at: string
          criminal: boolean
          dispatcher_id: string | null
          do_not_touch_hos: boolean
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          first_name: string | null
          going_yard: boolean
          hazmat: boolean
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
          is_checked_for_termination: boolean | null
          is_company_driver: boolean | null
          is_recovery: boolean | null
          last_dispatcher_id: string | null
          last_dispatcher_name: string | null
          last_name: string | null
          license_number: string | null
          load_bars: number
          mc_number: string | null
          medical_card_expiration_date: string | null
          mvr_date: string | null
          name: string | null
          note: string | null
          phone: string | null
          random_drug_test_date: string | null
          straps: number
          tanker: boolean
          termination_date: string | null
          twic: boolean
          two_week_block_date: string | null
          updated_at: string
          weekly_payment: number | null
          weeks_count: number | null
        }
        Insert: {
          agreement_start_date?: string | null
          cdl_expiration_date?: string | null
          cdl_number?: string | null
          cents_per_mile?: number | null
          citizen?: boolean
          clearing_house?: string | null
          company_address?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          criminal?: boolean
          dispatcher_id?: string | null
          do_not_touch_hos?: boolean
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string | null
          going_yard?: boolean
          hazmat?: boolean
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
          is_checked_for_termination?: boolean | null
          is_company_driver?: boolean | null
          is_recovery?: boolean | null
          last_dispatcher_id?: string | null
          last_dispatcher_name?: string | null
          last_name?: string | null
          license_number?: string | null
          load_bars?: number
          mc_number?: string | null
          medical_card_expiration_date?: string | null
          mvr_date?: string | null
          name?: string | null
          note?: string | null
          phone?: string | null
          random_drug_test_date?: string | null
          straps?: number
          tanker?: boolean
          termination_date?: string | null
          twic?: boolean
          two_week_block_date?: string | null
          updated_at?: string
          weekly_payment?: number | null
          weeks_count?: number | null
        }
        Update: {
          agreement_start_date?: string | null
          cdl_expiration_date?: string | null
          cdl_number?: string | null
          cents_per_mile?: number | null
          citizen?: boolean
          clearing_house?: string | null
          company_address?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          criminal?: boolean
          dispatcher_id?: string | null
          do_not_touch_hos?: boolean
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string | null
          going_yard?: boolean
          hazmat?: boolean
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
          is_checked_for_termination?: boolean | null
          is_company_driver?: boolean | null
          is_recovery?: boolean | null
          last_dispatcher_id?: string | null
          last_dispatcher_name?: string | null
          last_name?: string | null
          license_number?: string | null
          load_bars?: number
          mc_number?: string | null
          medical_card_expiration_date?: string | null
          mvr_date?: string | null
          name?: string | null
          note?: string | null
          phone?: string | null
          random_drug_test_date?: string | null
          straps?: number
          tanker?: boolean
          termination_date?: string | null
          twic?: boolean
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
      efs_other_requests: {
        Row: {
          amount: number
          city: string | null
          company_name: string | null
          created_at: string
          driver_id: string | null
          driver_name: string
          id: string
          purpose: string
          quantity: number | null
          receipt_path: string | null
          requested_at: string
          requested_by: string | null
          resend_email_id: string | null
          revised_rc_path: string | null
          state: string | null
          truck_number: string | null
        }
        Insert: {
          amount?: number
          city?: string | null
          company_name?: string | null
          created_at?: string
          driver_id?: string | null
          driver_name: string
          id?: string
          purpose: string
          quantity?: number | null
          receipt_path?: string | null
          requested_at?: string
          requested_by?: string | null
          resend_email_id?: string | null
          revised_rc_path?: string | null
          state?: string | null
          truck_number?: string | null
        }
        Update: {
          amount?: number
          city?: string | null
          company_name?: string | null
          created_at?: string
          driver_id?: string | null
          driver_name?: string
          id?: string
          purpose?: string
          quantity?: number | null
          receipt_path?: string | null
          requested_at?: string
          requested_by?: string | null
          resend_email_id?: string | null
          revised_rc_path?: string | null
          state?: string | null
          truck_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_other_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      exported_weeks: {
        Row: {
          created_at: string
          exported_at: string
          exported_by: string | null
          id: string
          week_end_date: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          exported_at?: string
          exported_by?: string | null
          id?: string
          week_end_date: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          exported_at?: string
          exported_by?: string | null
          id?: string
          week_end_date?: string
          week_start_date?: string
        }
        Relationships: []
      }
      final_update_sends: {
        Row: {
          driver_id: string | null
          driver_name: string | null
          id: string
          note: string | null
          send_date: string
          sent_at: string
          sent_by: string | null
          truck_id: string
          truck_number: string | null
        }
        Insert: {
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          note?: string | null
          send_date: string
          sent_at?: string
          sent_by?: string | null
          truck_id: string
          truck_number?: string | null
        }
        Update: {
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          note?: string | null
          send_date?: string
          sent_at?: string
          sent_by?: string | null
          truck_id?: string
          truck_number?: string | null
        }
        Relationships: []
      }
      fuel_driver_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string | null
          fuel_driver_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          fuel_driver_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          fuel_driver_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_driver_mappings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_transactions: {
        Row: {
          amount: number | null
          city: string | null
          company: string | null
          created_at: string
          driver_name: string
          fees: number | null
          id: string
          item: string
          location_name: string | null
          paid: boolean
          quantity: number | null
          state: string | null
          transaction_date: string
          transaction_number: string
          truck_number: string
          unit_price: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          amount?: number | null
          city?: string | null
          company?: string | null
          created_at?: string
          driver_name: string
          fees?: number | null
          id?: string
          item: string
          location_name?: string | null
          paid?: boolean
          quantity?: number | null
          state?: string | null
          transaction_date: string
          transaction_number: string
          truck_number: string
          unit_price?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          amount?: number | null
          city?: string | null
          company?: string | null
          created_at?: string
          driver_name?: string
          fees?: number | null
          id?: string
          item?: string
          location_name?: string | null
          paid?: boolean
          quantity?: number | null
          state?: string | null
          transaction_date?: string
          transaction_number?: string
          truck_number?: string
          unit_price?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      heatmap_city_counts: {
        Row: {
          city_lat: number
          city_lng: number
          city_name: string
          city_state: string
          count_date: string
          created_at: string | null
          id: string
          order_ids: string[] | null
          total_freight: number | null
          total_miles: number | null
          truck_count: number
        }
        Insert: {
          city_lat: number
          city_lng: number
          city_name: string
          city_state: string
          count_date: string
          created_at?: string | null
          id?: string
          order_ids?: string[] | null
          total_freight?: number | null
          total_miles?: number | null
          truck_count?: number
        }
        Update: {
          city_lat?: number
          city_lng?: number
          city_name?: string
          city_state?: string
          count_date?: string
          created_at?: string | null
          id?: string
          order_ids?: string[] | null
          total_freight?: number | null
          total_miles?: number | null
          truck_count?: number
        }
        Relationships: []
      }
      heatmap_reference_cities: {
        Row: {
          city_name: string
          id: string
          latitude: number
          longitude: number
          population: number
          state: string
        }
        Insert: {
          city_name: string
          id?: string
          latitude: number
          longitude: number
          population?: number
          state: string
        }
        Update: {
          city_name?: string
          id?: string
          latitude?: number
          longitude?: number
          population?: number
          state?: string
        }
        Relationships: []
      }
      hos_requests: {
        Row: {
          company_name: string
          created_at: string
          driver_name: string
          id: string
          notified_at: string | null
          request_details: string | null
          request_type: string
          requester_email: string
          requester_user_id: string | null
          status: string
          telegram_chat_id: string
          telegram_message_id: number
          truck_number: string
        }
        Insert: {
          company_name: string
          created_at?: string
          driver_name: string
          id?: string
          notified_at?: string | null
          request_details?: string | null
          request_type: string
          requester_email: string
          requester_user_id?: string | null
          status?: string
          telegram_chat_id: string
          telegram_message_id: number
          truck_number: string
        }
        Update: {
          company_name?: string
          created_at?: string
          driver_name?: string
          id?: string
          notified_at?: string | null
          request_details?: string | null
          request_type?: string
          requester_email?: string
          requester_user_id?: string | null
          status?: string
          telegram_chat_id?: string
          telegram_message_id?: number
          truck_number?: string
        }
        Relationships: []
      }
      ifta_records: {
        Row: {
          created_at: string
          fuel_type: string
          id: string
          jurisdiction: string
          tax_paid_gallons: number
          taxable_miles: number
          total_miles: number
          uploaded_at: string
          uploaded_by: string | null
          vehicle: string
        }
        Insert: {
          created_at?: string
          fuel_type: string
          id?: string
          jurisdiction: string
          tax_paid_gallons?: number
          taxable_miles?: number
          total_miles?: number
          uploaded_at?: string
          uploaded_by?: string | null
          vehicle: string
        }
        Update: {
          created_at?: string
          fuel_type?: string
          id?: string
          jurisdiction?: string
          tax_paid_gallons?: number
          taxable_miles?: number
          total_miles?: number
          uploaded_at?: string
          uploaded_by?: string | null
          vehicle?: string
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
      late_notifications: {
        Row: {
          created_at: string
          dispatcher_id: string | null
          id: string
          notified_at: string
          order_id: string
          stop_id: string | null
          stop_type: string
          truck_id: string | null
        }
        Insert: {
          created_at?: string
          dispatcher_id?: string | null
          id?: string
          notified_at?: string
          order_id: string
          stop_id?: string | null
          stop_type: string
          truck_id?: string | null
        }
        Update: {
          created_at?: string
          dispatcher_id?: string | null
          id?: string
          notified_at?: string
          order_id?: string
          stop_id?: string | null
          stop_type?: string
          truck_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "late_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_notifications_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
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
        ]
      }
      order_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          driver_price: number | null
          driver1_id: string | null
          driver2_id: string | null
          id: string
          manual_driver_name: string | null
          manual_trailer_number: string | null
          manual_truck_number: string | null
          miles: number | null
          order_id: string
          sequence_number: number
          trailer_id: string | null
          transfer_address: string | null
          transfer_city: string | null
          transfer_date: string | null
          transfer_datetime: string | null
          transfer_latitude: number | null
          transfer_longitude: number | null
          transfer_state: string | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_price?: number | null
          driver1_id?: string | null
          driver2_id?: string | null
          id?: string
          manual_driver_name?: string | null
          manual_trailer_number?: string | null
          manual_truck_number?: string | null
          miles?: number | null
          order_id: string
          sequence_number?: number
          trailer_id?: string | null
          transfer_address?: string | null
          transfer_city?: string | null
          transfer_date?: string | null
          transfer_datetime?: string | null
          transfer_latitude?: number | null
          transfer_longitude?: number | null
          transfer_state?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_price?: number | null
          driver1_id?: string | null
          driver2_id?: string | null
          id?: string
          manual_driver_name?: string | null
          manual_trailer_number?: string | null
          manual_truck_number?: string | null
          miles?: number | null
          order_id?: string
          sequence_number?: number
          trailer_id?: string | null
          transfer_address?: string | null
          transfer_city?: string | null
          transfer_date?: string | null
          transfer_datetime?: string | null
          transfer_latitude?: number | null
          transfer_longitude?: number | null
          transfer_state?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_transfers_driver1_id_fkey"
            columns: ["driver1_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_transfers_driver2_id_fkey"
            columns: ["driver2_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_transfers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_transfers_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_transfers_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      order_week_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          order_id: string
          original_week_start: string
          target_week_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id: string
          original_week_start: string
          target_week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string
          original_week_start?: string
          target_week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_week_overrides_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          additional_miles: number | null
          bol_force_complete: boolean
          bol_location: string | null
          booked_by: string
          booked_by_company_id: string
          broker_id: string | null
          broker_load_number: string | null
          canceled: boolean
          client_request_id: string | null
          commodity: string | null
          company_id: string
          created_at: string
          date_change_notes: string | null
          deleted_driver1_name: string | null
          deleted_driver2_name: string | null
          deleted_trailer_number: string | null
          deleted_truck_number: string | null
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
          internal_load_number: string | null
          invoiced: boolean | null
          invoiced_at: string | null
          is_partial: boolean | null
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
          lumper_items: Json | null
          lumper_revised_rc_path: string | null
          mileage: number | null
          no_tracking_fee: number | null
          no_tracking_fee_driver: number | null
          notes: string | null
          original_delivery_datetime: string | null
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
          other_additionals: number | null
          other_additionals_driver: number | null
          other_additionals_items: Json | null
          other_additionals_reason: string | null
          other_charges: number | null
          other_charges_driver: number | null
          other_charges_items: Json | null
          other_charges_reason: string | null
          paid: boolean | null
          partial_booked_by_companies: Json | null
          partial_broker_loads: Json | null
          partial_brokers: Json | null
          pickup_datetime: string | null
          pickup_end_datetime: string | null
          po_number: string | null
          pod_force_complete: boolean
          pu_number: string | null
          recovery_date: string | null
          recovery_driver_price: number | null
          recovery_freight_amount: number | null
          recovery_miles: number | null
          reference_number: string | null
          scale_drive_axle: number | null
          scale_gross: number | null
          scale_steer_axle: number | null
          scale_trailer_axle: number | null
          status: string | null
          tonu: number | null
          tonu_driver: number | null
          trailer_id: string | null
          truck_id: string | null
          updated_at: string
          weight: number | null
          weight_bol: number | null
          weight_rc: number | null
          wrong_address_fee: number | null
          wrong_address_fee_driver: number | null
        }
        Insert: {
          additional_miles?: number | null
          bol_force_complete?: boolean
          bol_location?: string | null
          booked_by: string
          booked_by_company_id: string
          broker_id?: string | null
          broker_load_number?: string | null
          canceled?: boolean
          client_request_id?: string | null
          commodity?: string | null
          company_id: string
          created_at?: string
          date_change_notes?: string | null
          deleted_driver1_name?: string | null
          deleted_driver2_name?: string | null
          deleted_trailer_number?: string | null
          deleted_truck_number?: string | null
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
          internal_load_number?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          is_partial?: boolean | null
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
          lumper_items?: Json | null
          lumper_revised_rc_path?: string | null
          mileage?: number | null
          no_tracking_fee?: number | null
          no_tracking_fee_driver?: number | null
          notes?: string | null
          original_delivery_datetime?: string | null
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
          other_additionals?: number | null
          other_additionals_driver?: number | null
          other_additionals_items?: Json | null
          other_additionals_reason?: string | null
          other_charges?: number | null
          other_charges_driver?: number | null
          other_charges_items?: Json | null
          other_charges_reason?: string | null
          paid?: boolean | null
          partial_booked_by_companies?: Json | null
          partial_broker_loads?: Json | null
          partial_brokers?: Json | null
          pickup_datetime?: string | null
          pickup_end_datetime?: string | null
          po_number?: string | null
          pod_force_complete?: boolean
          pu_number?: string | null
          recovery_date?: string | null
          recovery_driver_price?: number | null
          recovery_freight_amount?: number | null
          recovery_miles?: number | null
          reference_number?: string | null
          scale_drive_axle?: number | null
          scale_gross?: number | null
          scale_steer_axle?: number | null
          scale_trailer_axle?: number | null
          status?: string | null
          tonu?: number | null
          tonu_driver?: number | null
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
          weight?: number | null
          weight_bol?: number | null
          weight_rc?: number | null
          wrong_address_fee?: number | null
          wrong_address_fee_driver?: number | null
        }
        Update: {
          additional_miles?: number | null
          bol_force_complete?: boolean
          bol_location?: string | null
          booked_by?: string
          booked_by_company_id?: string
          broker_id?: string | null
          broker_load_number?: string | null
          canceled?: boolean
          client_request_id?: string | null
          commodity?: string | null
          company_id?: string
          created_at?: string
          date_change_notes?: string | null
          deleted_driver1_name?: string | null
          deleted_driver2_name?: string | null
          deleted_trailer_number?: string | null
          deleted_truck_number?: string | null
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
          internal_load_number?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          is_partial?: boolean | null
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
          lumper_items?: Json | null
          lumper_revised_rc_path?: string | null
          mileage?: number | null
          no_tracking_fee?: number | null
          no_tracking_fee_driver?: number | null
          notes?: string | null
          original_delivery_datetime?: string | null
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
          other_additionals?: number | null
          other_additionals_driver?: number | null
          other_additionals_items?: Json | null
          other_additionals_reason?: string | null
          other_charges?: number | null
          other_charges_driver?: number | null
          other_charges_items?: Json | null
          other_charges_reason?: string | null
          paid?: boolean | null
          partial_booked_by_companies?: Json | null
          partial_broker_loads?: Json | null
          partial_brokers?: Json | null
          pickup_datetime?: string | null
          pickup_end_datetime?: string | null
          po_number?: string | null
          pod_force_complete?: boolean
          pu_number?: string | null
          recovery_date?: string | null
          recovery_driver_price?: number | null
          recovery_freight_amount?: number | null
          recovery_miles?: number | null
          reference_number?: string | null
          scale_drive_axle?: number | null
          scale_gross?: number | null
          scale_steer_axle?: number | null
          scale_trailer_axle?: number | null
          status?: string | null
          tonu?: number | null
          tonu_driver?: number | null
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
          weight?: number | null
          weight_bol?: number | null
          weight_rc?: number | null
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
          latitude: number | null
          longitude: number | null
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
          latitude?: number | null
          longitude?: number | null
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
          latitude?: number | null
          longitude?: number | null
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
          individual_mode: boolean | null
          office: Database["public"]["Enums"]["office_location"] | null
          phone_number: string | null
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
          individual_mode?: boolean | null
          office?: Database["public"]["Enums"]["office_location"] | null
          phone_number?: string | null
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
          individual_mode?: boolean | null
          office?: Database["public"]["Enums"]["office_location"] | null
          phone_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proximity_tracking: {
        Row: {
          created_at: string
          entered_radius_at: string
          id: string
          order_id: string
          stop_id: string
          truck_id: string
        }
        Insert: {
          created_at?: string
          entered_radius_at?: string
          id?: string
          order_id: string
          stop_id: string
          truck_id: string
        }
        Update: {
          created_at?: string
          entered_radius_at?: string
          id?: string
          order_id?: string
          stop_id?: string
          truck_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proximity_tracking_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proximity_tracking_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "pickup_drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proximity_tracking_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
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
      recruiter_salary_payments: {
        Row: {
          adjustments: Json | null
          base_salary: number
          calculated_salary: number | null
          created_at: string
          extra_day_dates: string[]
          extra_days: number
          food_allowance: number
          id: string
          is_checked: boolean
          lost_day_dates: string[]
          lost_days: number
          month: string
          paid: boolean
          paid_amount: number | null
          paid_at: string | null
          recruiter_name: string | null
          updated_at: string
          user_id: string
          with_card_days: number
          without_card_days: number
        }
        Insert: {
          adjustments?: Json | null
          base_salary?: number
          calculated_salary?: number | null
          created_at?: string
          extra_day_dates?: string[]
          extra_days?: number
          food_allowance?: number
          id?: string
          is_checked?: boolean
          lost_day_dates?: string[]
          lost_days?: number
          month: string
          paid?: boolean
          paid_amount?: number | null
          paid_at?: string | null
          recruiter_name?: string | null
          updated_at?: string
          user_id: string
          with_card_days?: number
          without_card_days?: number
        }
        Update: {
          adjustments?: Json | null
          base_salary?: number
          calculated_salary?: number | null
          created_at?: string
          extra_day_dates?: string[]
          extra_days?: number
          food_allowance?: number
          id?: string
          is_checked?: boolean
          lost_day_dates?: string[]
          lost_days?: number
          month?: string
          paid?: boolean
          paid_amount?: number | null
          paid_at?: string | null
          recruiter_name?: string | null
          updated_at?: string
          user_id?: string
          with_card_days?: number
          without_card_days?: number
        }
        Relationships: []
      }
      repairs: {
        Row: {
          accounting_note: string | null
          amount: number
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          is_paid: boolean
          reason: string
          repair_date: string
          repair_type: string
          trailer_id: string | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          accounting_note?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          is_paid?: boolean
          reason: string
          repair_date?: string
          repair_type: string
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          accounting_note?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          is_paid?: boolean
          reason?: string
          repair_date?: string
          repair_type?: string
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repairs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      roadside_inspections: {
        Row: {
          created_at: string
          created_by: string | null
          dispatcher_id: string | null
          driver_id: string | null
          eta_datetime: string | null
          id: string
          inspection_level: number | null
          location: string | null
          maintenance_check_road: string | null
          maintenance_check_yard: string | null
          reason: string | null
          road_check_approved: boolean
          road_check_approved_by: string | null
          roadside_inspection_date: string | null
          truck_id: string | null
          updated_at: string
          yard_check_approved: boolean
          yard_check_approved_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dispatcher_id?: string | null
          driver_id?: string | null
          eta_datetime?: string | null
          id?: string
          inspection_level?: number | null
          location?: string | null
          maintenance_check_road?: string | null
          maintenance_check_yard?: string | null
          reason?: string | null
          road_check_approved?: boolean
          road_check_approved_by?: string | null
          roadside_inspection_date?: string | null
          truck_id?: string | null
          updated_at?: string
          yard_check_approved?: boolean
          yard_check_approved_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dispatcher_id?: string | null
          driver_id?: string | null
          eta_datetime?: string | null
          id?: string
          inspection_level?: number | null
          location?: string | null
          maintenance_check_road?: string | null
          maintenance_check_yard?: string | null
          reason?: string | null
          road_check_approved?: boolean
          road_check_approved_by?: string | null
          roadside_inspection_date?: string | null
          truck_id?: string | null
          updated_at?: string
          yard_check_approved?: boolean
          yard_check_approved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roadside_inspections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadside_inspections_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      role_flip_log: {
        Row: {
          action: string
          chicago_date: string | null
          chicago_hour: number | null
          direction: string
          dispatcher_name: string | null
          executed_at: string
          from_role: Database["public"]["Enums"]["app_role"] | null
          id: string
          message: string | null
          schedule_id: string | null
          to_role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Insert: {
          action: string
          chicago_date?: string | null
          chicago_hour?: number | null
          direction: string
          dispatcher_name?: string | null
          executed_at?: string
          from_role?: Database["public"]["Enums"]["app_role"] | null
          id?: string
          message?: string | null
          schedule_id?: string | null
          to_role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Update: {
          action?: string
          chicago_date?: string | null
          chicago_hour?: number | null
          direction?: string
          dispatcher_name?: string | null
          executed_at?: string
          from_role?: Database["public"]["Enums"]["app_role"] | null
          id?: string
          message?: string | null
          schedule_id?: string | null
          to_role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_flip_log_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "afterhours_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      samsara_locations_cache: {
        Row: {
          fetch_started_at: string | null
          fetched_at: string
          id: string
          is_fetching: boolean
          locations: Json
        }
        Insert: {
          fetch_started_at?: string | null
          fetched_at?: string
          id?: string
          is_fetching?: boolean
          locations?: Json
        }
        Update: {
          fetch_started_at?: string | null
          fetched_at?: string
          id?: string
          is_fetching?: boolean
          locations?: Json
        }
        Relationships: []
      }
      temporary_plates: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          truck_id: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          truck_id: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          truck_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "temporary_plates_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
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
      trailer_termination_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          trailer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          trailer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          trailer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_termination_notes_trailer_id_fkey"
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
          is_active: boolean
          plate: string | null
          plate_expiration_date: string | null
          status: string | null
          termination_date: string | null
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
          is_active?: boolean
          plate?: string | null
          plate_expiration_date?: string | null
          status?: string | null
          termination_date?: string | null
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
          is_active?: boolean
          plate?: string | null
          plate_expiration_date?: string | null
          status?: string | null
          termination_date?: string | null
          trailer_number?: string
          trailer_type?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: []
      }
      transfer_list: {
        Row: {
          coming_to_office: string | null
          created_at: string | null
          created_by: string | null
          driver_id: string | null
          driver_informed: boolean
          drug_test_date: string | null
          drug_test_zip: string | null
          eta_time: string | null
          finished: boolean
          going_to_company: string | null
          id: string
          safety_user_id: string | null
          sign: boolean
          transfer_type: string
          truck_id: string | null
          updated_at: string | null
        }
        Insert: {
          coming_to_office?: string | null
          created_at?: string | null
          created_by?: string | null
          driver_id?: string | null
          driver_informed?: boolean
          drug_test_date?: string | null
          drug_test_zip?: string | null
          eta_time?: string | null
          finished?: boolean
          going_to_company?: string | null
          id?: string
          safety_user_id?: string | null
          sign?: boolean
          transfer_type?: string
          truck_id?: string | null
          updated_at?: string | null
        }
        Update: {
          coming_to_office?: string | null
          created_at?: string | null
          created_by?: string | null
          driver_id?: string | null
          driver_informed?: boolean
          drug_test_date?: string | null
          drug_test_zip?: string | null
          eta_time?: string | null
          finished?: boolean
          going_to_company?: string | null
          id?: string
          safety_user_id?: string | null
          sign?: boolean
          transfer_type?: string
          truck_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_list_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_list_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      trips_paid_status: {
        Row: {
          created_at: string
          driver_name: string
          id: string
          is_paid: boolean
          marked_by: string | null
          truck_number: string
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          driver_name: string
          id?: string
          is_paid?: boolean
          marked_by?: string | null
          truck_number: string
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          driver_name?: string
          id?: string
          is_paid?: boolean
          marked_by?: string | null
          truck_number?: string
          updated_at?: string
          week_start?: string
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
          truck_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          note?: string | null
          truck_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          note?: string | null
          truck_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_notes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_termination_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          truck_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          truck_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          truck_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "truck_termination_notes_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
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
          engine: string | null
          eta_minutes: number | null
          fuel_level: number | null
          has_apu_webasto: boolean
          has_fridge: boolean
          has_inverter: boolean
          id: string
          insurance_expiration_date: string | null
          ipass: string | null
          is_active: boolean
          left_by_driver_id: string | null
          maintenance_check_date: string | null
          make: string | null
          miles: number | null
          miles_away: number | null
          miles_away_updated_at: string | null
          model: string | null
          needs_recovery: boolean | null
          oil_change_date: string | null
          plate: string | null
          plate_expiration_date: string | null
          status: string | null
          termination_date: string | null
          tires_swap_date: string | null
          trailer_id: string | null
          transmission: string | null
          truck_number: string
          truck_sales_status: string | null
          truck_type: string | null
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          dispatcher_id?: string | null
          dot_inspection_date?: string | null
          driver1_id?: string | null
          driver2_id?: string | null
          engine?: string | null
          eta_minutes?: number | null
          fuel_level?: number | null
          has_apu_webasto?: boolean
          has_fridge?: boolean
          has_inverter?: boolean
          id?: string
          insurance_expiration_date?: string | null
          ipass?: string | null
          is_active?: boolean
          left_by_driver_id?: string | null
          maintenance_check_date?: string | null
          make?: string | null
          miles?: number | null
          miles_away?: number | null
          miles_away_updated_at?: string | null
          model?: string | null
          needs_recovery?: boolean | null
          oil_change_date?: string | null
          plate?: string | null
          plate_expiration_date?: string | null
          status?: string | null
          termination_date?: string | null
          tires_swap_date?: string | null
          trailer_id?: string | null
          transmission?: string | null
          truck_number: string
          truck_sales_status?: string | null
          truck_type?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          dispatcher_id?: string | null
          dot_inspection_date?: string | null
          driver1_id?: string | null
          driver2_id?: string | null
          engine?: string | null
          eta_minutes?: number | null
          fuel_level?: number | null
          has_apu_webasto?: boolean
          has_fridge?: boolean
          has_inverter?: boolean
          id?: string
          insurance_expiration_date?: string | null
          ipass?: string | null
          is_active?: boolean
          left_by_driver_id?: string | null
          maintenance_check_date?: string | null
          make?: string | null
          miles?: number | null
          miles_away?: number | null
          miles_away_updated_at?: string | null
          model?: string | null
          needs_recovery?: boolean | null
          oil_change_date?: string | null
          plate?: string | null
          plate_expiration_date?: string | null
          status?: string | null
          termination_date?: string | null
          tires_swap_date?: string | null
          trailer_id?: string | null
          transmission?: string | null
          truck_number?: string
          truck_sales_status?: string | null
          truck_type?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
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
            isOneToOne: true
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
      weekly_plans: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          is_admin_unlocked: boolean
          plan_text: string
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          updated_by: string | null
          week_start: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          is_admin_unlocked?: boolean
          plan_text?: string
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          updated_by?: string | null
          week_start: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          is_admin_unlocked?: boolean
          plan_text?: string
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          updated_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      yard_loads: {
        Row: {
          broker_name: string | null
          created_at: string
          delivery_city: string | null
          delivery_date: string | null
          delivery_state: string | null
          driver_name: string | null
          id: string
          internal_load_number: number | null
          notes: string | null
          order_id: string | null
          trailer_number: string | null
          truck_number: string | null
          updated_at: string
        }
        Insert: {
          broker_name?: string | null
          created_at?: string
          delivery_city?: string | null
          delivery_date?: string | null
          delivery_state?: string | null
          driver_name?: string | null
          id?: string
          internal_load_number?: number | null
          notes?: string | null
          order_id?: string | null
          trailer_number?: string | null
          truck_number?: string | null
          updated_at?: string
        }
        Update: {
          broker_name?: string | null
          created_at?: string
          delivery_city?: string | null
          delivery_date?: string | null
          delivery_state?: string | null
          driver_name?: string | null
          id?: string
          internal_load_number?: number | null
          notes?: string | null
          order_id?: string | null
          trailer_number?: string | null
          truck_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yard_loads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      bulk_update_hos: { Args: { updates: Json }; Returns: number }
      bulk_update_truck_distances: {
        Args: { updates: Json }
        Returns: undefined
      }
      calculate_empty_days_by_dispatcher: {
        Args: { p_end_date: string; p_office?: string; p_start_date: string }
        Returns: {
          dispatcher_id: string
          empty_day_count: number
          office: string
        }[]
      }
      create_order_with_unique_load_number: {
        Args: { order_data: Json }
        Returns: Json
      }
      flip_afterhours_roles: { Args: { direction: string }; Returns: undefined }
      get_assignment_history: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_from_date?: string
          p_limit?: number
          p_to_date?: string
        }
        Returns: {
          change_type: string
          changed_at: string
          changed_by: string
          changed_by_name: string
          dispatcher_id: string
          dispatcher_name: string
          driver1_id: string
          driver1_name: string
          driver2_id: string
          driver2_name: string
          id: string
          old_dispatcher_id: string
          old_dispatcher_name: string
          old_driver1_id: string
          old_driver1_name: string
          old_driver2_id: string
          old_driver2_name: string
          old_trailer_id: string
          old_trailer_number: string
          old_truck_id: string
          old_truck_number: string
          reason: string
          trailer_id: string
          trailer_number: string
          truck_id: string
          truck_number: string
        }[]
      }
      get_dashboard_stats: {
        Args: never
        Returns: {
          active_drivers: number
          active_orders: number
          available_trucks: number
          total_brokers: number
        }[]
      }
      get_dispatcher_salary_penalties: {
        Args: { _month: string; _user_id: string }
        Returns: Json
      }
      get_distinct_booked_by: {
        Args: never
        Returns: {
          booked_by: string
        }[]
      }
      get_driver_id_for_user: { Args: never; Returns: string }
      get_facility_visit_counts:
        | {
            Args: never
            Returns: {
              address: string
              city: string
              company_name: string
              delivery_count: number
              pickup_count: number
              state: string
              total_visits: number
              zip_code: string
            }[]
          }
        | {
            Args: { p_end_date?: string; p_start_date?: string }
            Returns: {
              address: string
              city: string
              company_name: string
              delivery_count: number
              pickup_count: number
              state: string
              total_visits: number
              zip_code: string
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
      has_any_role: {
        Args: { roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_schedule_manager: { Args: { _user_id: string }; Returns: boolean }
      log_pii_view: {
        Args: {
          p_driver_id: string
          p_fields_accessed: string[]
          p_reason?: string
        }
        Returns: undefined
      }
      lookup_load_office: {
        Args: { p_term: string }
        Returns: {
          driver1_id: string
          is_canceled: boolean
          is_locked: boolean
          office: string
          pickup_datetime: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sign_out_all_users: { Args: never; Returns: Json }
      try_advisory_lock_truck_distances: { Args: never; Returns: boolean }
      validate_driver_email: { Args: { p_email: string }; Returns: Json }
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
        | "yard"
        | "recruiting"
        | "claims"
      office_location:
        | "Čačak"
        | "KRAGUJEVAC"
        | "BG 1st floor"
        | "BG 4th floor"
        | "Recovery"
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
        "yard",
        "recruiting",
        "claims",
      ],
      office_location: [
        "Čačak",
        "KRAGUJEVAC",
        "BG 1st floor",
        "BG 4th floor",
        "Recovery",
      ],
    },
  },
} as const
