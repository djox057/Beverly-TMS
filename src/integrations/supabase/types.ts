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
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          mc_number: string | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          mc_number?: string | null
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          mc_number?: string | null
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
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
          created_at: string
          email: string | null
          home_address: string | null
          home_city: string | null
          home_latitude: number | null
          home_longitude: number | null
          home_state: string | null
          id: string
          license_number: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          home_address?: string | null
          home_city?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          home_state?: string | null
          id?: string
          license_number?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          home_address?: string | null
          home_city?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          home_state?: string | null
          id?: string
          license_number?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          booked_by: string | null
          broker_id: string | null
          broker_load_number: string | null
          company_id: string
          created_at: string
          delivery_datetime: string | null
          driver_price: number | null
          driver1_id: string | null
          driver2_id: string | null
          freight_amount: number | null
          id: string
          internal_load_number: number | null
          invoiced: boolean | null
          load_number: string
          mileage: number | null
          notes: string | null
          pickup_datetime: string | null
          status: string | null
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
          driver_price?: number | null
          driver1_id?: string | null
          driver2_id?: string | null
          freight_amount?: number | null
          id?: string
          internal_load_number?: number | null
          invoiced?: boolean | null
          load_number: string
          mileage?: number | null
          notes?: string | null
          pickup_datetime?: string | null
          status?: string | null
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
          driver_price?: number | null
          driver1_id?: string | null
          driver2_id?: string | null
          freight_amount?: number | null
          id?: string
          internal_load_number?: number | null
          invoiced?: boolean | null
          load_number?: string
          mileage?: number | null
          notes?: string | null
          pickup_datetime?: string | null
          status?: string | null
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
          city: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          datetime: string | null
          id: string
          order_id: string
          sequence_number: number | null
          special_instructions: string | null
          state: string
          type: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address: string
          city: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          datetime?: string | null
          id?: string
          order_id: string
          sequence_number?: number | null
          special_instructions?: string | null
          state: string
          type: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string
          city?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          datetime?: string | null
          id?: string
          order_id?: string
          sequence_number?: number | null
          special_instructions?: string | null
          state?: string
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
      trailers: {
        Row: {
          capacity: number | null
          created_at: string
          id: string
          status: string | null
          trailer_number: string
          trailer_type: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          id?: string
          status?: string | null
          trailer_number: string
          trailer_type?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          id?: string
          status?: string | null
          trailer_number?: string
          trailer_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trucks: {
        Row: {
          created_at: string
          driver1_id: string | null
          driver2_id: string | null
          fleet_assignment: string | null
          id: string
          make: string | null
          model: string | null
          status: string | null
          trailer_id: string | null
          truck_number: string
          truck_type: string | null
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          driver1_id?: string | null
          driver2_id?: string | null
          fleet_assignment?: string | null
          id?: string
          make?: string | null
          model?: string | null
          status?: string | null
          trailer_id?: string | null
          truck_number: string
          truck_type?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          driver1_id?: string | null
          driver2_id?: string | null
          fleet_assignment?: string | null
          id?: string
          make?: string | null
          model?: string | null
          status?: string | null
          trailer_id?: string | null
          truck_number?: string
          truck_type?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
