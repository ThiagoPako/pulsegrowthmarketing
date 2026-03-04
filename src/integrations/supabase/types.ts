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
      endomarketing_agendamentos: {
        Row: {
          cancellation_reason: string | null
          checklist: Json | null
          cliente_id: string
          created_at: string
          date: string
          duration: number
          id: string
          notes: string | null
          profissional_id: string
          start_time: string
          status: string
          updated_at: string
          videomaker_id: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          checklist?: Json | null
          cliente_id: string
          created_at?: string
          date: string
          duration?: number
          id?: string
          notes?: string | null
          profissional_id: string
          start_time: string
          status?: string
          updated_at?: string
          videomaker_id?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          checklist?: Json | null
          cliente_id?: string
          created_at?: string
          date?: string
          duration?: number
          id?: string
          notes?: string | null
          profissional_id?: string
          start_time?: string
          status?: string
          updated_at?: string
          videomaker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "endomarketing_agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "endomarketing_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endomarketing_agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "endomarketing_profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      endomarketing_clientes: {
        Row: {
          active: boolean
          client_id: string | null
          color: string | null
          company_name: string
          created_at: string
          editorial: string | null
          execution_type: string
          id: string
          notes: string | null
          phone: string | null
          plan_type: string
          presence_days_per_week: number
          responsible_person: string | null
          selected_days: string[]
          session_duration: number
          stories_per_week: number
          total_contracted_hours: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_id?: string | null
          color?: string | null
          company_name: string
          created_at?: string
          editorial?: string | null
          execution_type?: string
          id?: string
          notes?: string | null
          phone?: string | null
          plan_type?: string
          presence_days_per_week?: number
          responsible_person?: string | null
          selected_days?: string[]
          session_duration?: number
          stories_per_week?: number
          total_contracted_hours?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_id?: string | null
          color?: string | null
          company_name?: string
          created_at?: string
          editorial?: string | null
          execution_type?: string
          id?: string
          notes?: string | null
          phone?: string | null
          plan_type?: string
          presence_days_per_week?: number
          responsible_person?: string | null
          selected_days?: string[]
          session_duration?: number
          stories_per_week?: number
          total_contracted_hours?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      endomarketing_logs: {
        Row: {
          action: string
          agendamento_id: string | null
          cliente_id: string | null
          created_at: string
          details: Json | null
          id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          agendamento_id?: string | null
          cliente_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          agendamento_id?: string | null
          cliente_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "endomarketing_logs_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "endomarketing_agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endomarketing_logs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "endomarketing_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      endomarketing_profissionais: {
        Row: {
          active: boolean
          available_days: string[]
          created_at: string
          end_time: string
          id: string
          max_hours_per_day: number
          start_time: string
          user_id: string
        }
        Insert: {
          active?: boolean
          available_days?: string[]
          created_at?: string
          end_time?: string
          id?: string
          max_hours_per_day?: number
          start_time?: string
          user_id: string
        }
        Update: {
          active?: boolean
          available_days?: string[]
          created_at?: string
          end_time?: string
          id?: string
          max_hours_per_day?: number
          start_time?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          job_title: string | null
          name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          job_title?: string | null
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          job_title?: string | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
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
      app_role:
        | "admin"
        | "videomaker"
        | "social_media"
        | "editor"
        | "endomarketing"
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
        "admin",
        "videomaker",
        "social_media",
        "editor",
        "endomarketing",
      ],
    },
  },
} as const
