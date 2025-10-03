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
      drivers: {
        Row: {
          cdl_expiration_date: string | null
          cdl_number: string | null
          clearing_house: string | null
          created_at: string
          email: string | null
          fein: string | null
          fuel_card_number: string | null
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
          license_number: string | null
          medical_card_expiration_date: string | null
          mvr_date: string | null
          name: string
          personal_id: string | null
          phone: string | null
          ssn: string | null
          termination_date: string | null
          updated_at: string
        }
        Insert: {
          cdl_expiration_date?: string | null
          cdl_number?: string | null
          clearing_house?: string | null
          created_at?: string
          email?: string | null
          fein?: string | null
          fuel_card_number?: string | null
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
          license_number?: string | null
          medical_card_expiration_date?: string | null
          mvr_date?: string | null
          name: string
          personal_id?: string | null
          phone?: string | null
          ssn?: string | null
          termination_date?: string | null
          updated_at?: string
        }
        Update: {
          cdl_expiration_date?: string | null
          cdl_number?: string | null
          clearing_house?: string | null
          created_at?: string
          email?: string | null
          fein?: string | null
          fuel_card_number?: string | null
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
          license_number?: string | null
          medical_card_expiration_date?: string | null
          mvr_date?: string | null
          name?: string
          personal_id?: string | null
          phone?: string | null
          ssn?: string | null
          termination_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lost_day_notes: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string
          truck_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          note?: string
          truck_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string
          truck_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      orders: {
        Row: {
          booked_by: string | null
          broker_id: string | null
          broker_load_number: string | null
          company_id: string
          created_at: string
          delivery_datetime: string | null
          delivery_end_datetime: string | null
          detention: number | null
          dh_miles: number | null
          driver_price: number | null
          driver1_id: string | null
          driver2_id: string | null
          extra_stop: number | null
          freight_amount: number | null
          id: string
          internal_load_number: number | null
          invoiced: boolean | null
          late_fee: number | null
          layover: number | null
          load_number: string
          loaded_miles: number | null
          lumper: number | null
          mileage: number | null
          notes: string | null
          pickup_datetime: string | null
          pickup_end_datetime: string | null
          status: string | null
          tonu: number | null
          trailer_id: string | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          booked_by?: string | null
          broker_id?: string | null
          broker_load_number?: string | null
          company_id: string
          created_at?: string
          delivery_datetime?: string | null
          delivery_end_datetime?: string | null
          detention?: number | null
          dh_miles?: number | null
          driver_price?: number | null
          driver1_id?: string | null
          driver2_id?: string | null
          extra_stop?: number | null
          freight_amount?: number | null
          id?: string
          internal_load_number?: number | null
          invoiced?: boolean | null
          late_fee?: number | null
          layover?: number | null
          load_number: string
          loaded_miles?: number | null
          lumper?: number | null
          mileage?: number | null
          notes?: string | null
          pickup_datetime?: string | null
          pickup_end_datetime?: string | null
          status?: string | null
          tonu?: number | null
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          booked_by?: string | null
          broker_id?: string | null
          broker_load_number?: string | null
          company_id?: string
          created_at?: string
          delivery_datetime?: string | null
          delivery_end_datetime?: string | null
          detention?: number | null
          dh_miles?: number | null
          driver_price?: number | null
          driver1_id?: string | null
          driver2_id?: string | null
          extra_stop?: number | null
          freight_amount?: number | null
          id?: string
          internal_load_number?: number | null
          invoiced?: boolean | null
          late_fee?: number | null
          layover?: number | null
          load_number?: string
          loaded_miles?: number | null
          lumper?: number | null
          mileage?: number | null
          notes?: string | null
          pickup_datetime?: string | null
          pickup_end_datetime?: string | null
          status?: string | null
          tonu?: number | null
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          datetime: string | null
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
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          datetime?: string | null
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
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          datetime?: string | null
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      truck_notes: {
        Row: {
          created_at: string
          id: string
          note: string | null
          truck_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          truck_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          truck_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
          miles_away: number | null
          model: string | null
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
          miles_away?: number | null
          model?: string | null
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
          miles_away?: number | null
          model?: string | null
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
      [_ in never]: never
    }
    Functions: {
      create_order_with_unique_load_number: {
        Args: { order_data: Json }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "dispatch" | "admin" | "manager" | "driver"
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
      app_role: ["dispatch", "admin", "manager", "driver"],
    },
  },
} as const
