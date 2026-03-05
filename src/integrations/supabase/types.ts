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
      active_recordings: {
        Row: {
          client_id: string
          id: string
          recording_id: string
          started_at: string
          videomaker_id: string
        }
        Insert: {
          client_id: string
          id?: string
          recording_id: string
          started_at?: string
          videomaker_id: string
        }
        Update: {
          client_id?: string
          id?: string
          recording_id?: string
          started_at?: string
          videomaker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_recordings_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: true
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_recordings_videomaker_id_fkey"
            columns: ["videomaker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_messages: {
        Row: {
          client_id: string
          id: string
          message_type: string
          revenue_id: string | null
          sent_at: string
          status: string
        }
        Insert: {
          client_id: string
          id?: string
          message_type?: string
          revenue_id?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          client_id?: string
          id?: string
          message_type?: string
          revenue_id?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_messages_revenue_id_fkey"
            columns: ["revenue_id"]
            isOneToOne: false
            referencedRelation: "revenues"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reserve_movements: {
        Row: {
          amount: number
          created_at: string
          date: string
          description: string
          id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date?: string
          description?: string
          id?: string
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          description?: string
          id?: string
          type?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          accepts_extra: boolean
          auto_renewal: boolean
          backup_day: string
          backup_time: string
          color: string
          company_name: string
          contract_start_date: string | null
          created_at: string
          extra_client_appears: boolean
          extra_content_types: string[]
          extra_day: string
          fixed_day: string
          fixed_time: string
          has_endomarketing: boolean
          id: string
          logo_url: string | null
          monthly_recordings: number
          phone: string
          plan_id: string | null
          presence_days: number
          responsible_person: string
          updated_at: string
          videomaker_id: string | null
          weekly_creatives: number
          weekly_goal: number
          weekly_reels: number
          weekly_stories: number
          whatsapp: string
        }
        Insert: {
          accepts_extra?: boolean
          auto_renewal?: boolean
          backup_day?: string
          backup_time?: string
          color?: string
          company_name: string
          contract_start_date?: string | null
          created_at?: string
          extra_client_appears?: boolean
          extra_content_types?: string[]
          extra_day?: string
          fixed_day?: string
          fixed_time?: string
          has_endomarketing?: boolean
          id?: string
          logo_url?: string | null
          monthly_recordings?: number
          phone?: string
          plan_id?: string | null
          presence_days?: number
          responsible_person?: string
          updated_at?: string
          videomaker_id?: string | null
          weekly_creatives?: number
          weekly_goal?: number
          weekly_reels?: number
          weekly_stories?: number
          whatsapp?: string
        }
        Update: {
          accepts_extra?: boolean
          auto_renewal?: boolean
          backup_day?: string
          backup_time?: string
          color?: string
          company_name?: string
          contract_start_date?: string | null
          created_at?: string
          extra_client_appears?: boolean
          extra_content_types?: string[]
          extra_day?: string
          fixed_day?: string
          fixed_time?: string
          has_endomarketing?: boolean
          id?: string
          logo_url?: string | null
          monthly_recordings?: number
          phone?: string
          plan_id?: string | null
          presence_days?: number
          responsible_person?: string
          updated_at?: string
          videomaker_id?: string | null
          weekly_creatives?: number
          weekly_goal?: number
          weekly_reels?: number
          weekly_stories?: number
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_videomaker_id_fkey"
            columns: ["videomaker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          id: string
          recording_duration: number
          shift_a_end: string
          shift_a_start: string
          shift_b_end: string
          shift_b_start: string
          updated_at: string
          work_days: string[]
        }
        Insert: {
          id?: string
          recording_duration?: number
          shift_a_end?: string
          shift_a_start?: string
          shift_b_end?: string
          shift_b_start?: string
          updated_at?: string
          work_days?: string[]
        }
        Update: {
          id?: string
          recording_duration?: number
          shift_a_end?: string
          shift_a_start?: string
          shift_b_end?: string
          shift_b_start?: string
          updated_at?: string
          work_days?: string[]
        }
        Relationships: []
      }
      delivery_records: {
        Row: {
          arts_produced: number
          client_id: string
          created_at: string
          creatives_produced: number
          date: string
          delivery_status: string
          extras_produced: number
          id: string
          observations: string | null
          recording_id: string | null
          reels_produced: number
          stories_produced: number
          updated_at: string
          videomaker_id: string
          videos_recorded: number
        }
        Insert: {
          arts_produced?: number
          client_id: string
          created_at?: string
          creatives_produced?: number
          date: string
          delivery_status?: string
          extras_produced?: number
          id?: string
          observations?: string | null
          recording_id?: string | null
          reels_produced?: number
          stories_produced?: number
          updated_at?: string
          videomaker_id: string
          videos_recorded?: number
        }
        Update: {
          arts_produced?: number
          client_id?: string
          created_at?: string
          creatives_produced?: number
          date?: string
          delivery_status?: string
          extras_produced?: number
          id?: string
          observations?: string | null
          recording_id?: string | null
          reels_produced?: number
          stories_produced?: number
          updated_at?: string
          videomaker_id?: string
          videos_recorded?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_records_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_records_videomaker_id_fkey"
            columns: ["videomaker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          date: string
          description: string
          expense_type: string
          id: string
          responsible: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id: string
          created_at?: string
          date?: string
          description?: string
          expense_type?: string
          id?: string
          responsible?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          date?: string
          description?: string
          expense_type?: string
          id?: string
          responsible?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_contracts: {
        Row: {
          client_id: string
          contract_start_date: string
          contract_value: number
          created_at: string
          due_day: number
          id: string
          payment_method: string
          plan_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contract_start_date?: string
          contract_value?: number
          created_at?: string
          due_day?: number
          id?: string
          payment_method?: string
          plan_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contract_start_date?: string
          contract_value?: number
          created_at?: string
          due_day?: number
          id?: string
          payment_method?: string
          plan_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_contracts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_tasks: {
        Row: {
          checklist: Json
          client_id: string
          column: string
          created_at: string
          id: string
          recording_date: string | null
          title: string
          updated_at: string
          week_start: string
        }
        Insert: {
          checklist?: Json
          client_id: string
          column?: string
          created_at?: string
          id?: string
          recording_date?: string | null
          title: string
          updated_at?: string
          week_start: string
        }
        Update: {
          checklist?: Json
          client_id?: string
          column?: string
          created_at?: string
          id?: string
          recording_date?: string | null
          title?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_config: {
        Row: {
          bank: string
          document: string
          id: string
          pix_key: string
          receiver_name: string
          updated_at: string
        }
        Insert: {
          bank?: string
          document?: string
          id?: string
          pix_key?: string
          receiver_name?: string
          updated_at?: string
        }
        Update: {
          bank?: string
          document?: string
          id?: string
          pix_key?: string
          receiver_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          arts_qty: number
          created_at: string
          creatives_qty: number
          description: string
          extra_content_allowed: number
          id: string
          name: string
          periodicity: string
          price: number
          recording_hours: number
          recording_sessions: number
          reels_qty: number
          status: string
          stories_qty: number
          updated_at: string
        }
        Insert: {
          arts_qty?: number
          created_at?: string
          creatives_qty?: number
          description?: string
          extra_content_allowed?: number
          id?: string
          name: string
          periodicity?: string
          price?: number
          recording_hours?: number
          recording_sessions?: number
          reels_qty?: number
          status?: string
          stories_qty?: number
          updated_at?: string
        }
        Update: {
          arts_qty?: number
          created_at?: string
          creatives_qty?: number
          description?: string
          extra_content_allowed?: number
          id?: string
          name?: string
          periodicity?: string
          price?: number
          recording_hours?: number
          recording_sessions?: number
          reels_qty?: number
          status?: string
          stories_qty?: number
          updated_at?: string
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
      recordings: {
        Row: {
          client_id: string
          confirmation_status: string
          created_at: string
          date: string
          id: string
          start_time: string
          status: string
          type: string
          videomaker_id: string
        }
        Insert: {
          client_id: string
          confirmation_status?: string
          created_at?: string
          date: string
          id?: string
          start_time: string
          status?: string
          type?: string
          videomaker_id: string
        }
        Update: {
          client_id?: string
          confirmation_status?: string
          created_at?: string
          date?: string
          id?: string
          start_time?: string
          status?: string
          type?: string
          videomaker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_videomaker_id_fkey"
            columns: ["videomaker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenues: {
        Row: {
          amount: number
          client_id: string
          contract_id: string
          created_at: string
          due_date: string
          id: string
          paid_at: string | null
          reference_month: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          client_id: string
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          paid_at?: string | null
          reference_month: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          reference_month?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "financial_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          client_id: string
          content: string
          content_format: string
          created_at: string
          endo_client_id: string | null
          id: string
          is_endomarketing: boolean
          priority: string
          recorded: boolean
          scheduled_date: string | null
          title: string
          updated_at: string
          video_type: string
        }
        Insert: {
          client_id: string
          content?: string
          content_format?: string
          created_at?: string
          endo_client_id?: string | null
          id?: string
          is_endomarketing?: boolean
          priority?: string
          recorded?: boolean
          scheduled_date?: string | null
          title: string
          updated_at?: string
          video_type?: string
        }
        Update: {
          client_id?: string
          content?: string
          content_format?: string
          created_at?: string
          endo_client_id?: string | null
          id?: string
          is_endomarketing?: boolean
          priority?: string
          recorded?: boolean
          scheduled_date?: string | null
          title?: string
          updated_at?: string
          video_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_endo_client_id_fkey"
            columns: ["endo_client_id"]
            isOneToOne: false
            referencedRelation: "endomarketing_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media_deliveries: {
        Row: {
          client_id: string
          content_type: string
          created_at: string
          created_by: string | null
          delivered_at: string
          description: string | null
          id: string
          platform: string | null
          posted_at: string | null
          recording_id: string | null
          scheduled_time: string | null
          script_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          description?: string | null
          id?: string
          platform?: string | null
          posted_at?: string | null
          recording_id?: string | null
          scheduled_time?: string | null
          script_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          description?: string | null
          id?: string
          platform?: string | null
          posted_at?: string | null
          recording_id?: string | null
          scheduled_time?: string | null
          script_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_media_deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_deliveries_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_deliveries_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_config: {
        Row: {
          api_token: string
          api_token_configured: boolean
          auto_confirmation: boolean
          auto_recording_reminder: boolean
          auto_recording_scheduled: boolean
          auto_video_approval: boolean
          auto_video_approved: boolean
          close_ticket: boolean
          default_queue_id: string
          default_user_id: string
          id: string
          integration_active: boolean
          msg_backup_confirmed: string
          msg_backup_invite: string
          msg_confirmation: string
          msg_confirmation_cancelled: string
          msg_confirmation_confirmed: string
          msg_recording_reminder: string
          msg_recording_scheduled: string
          msg_video_approval: string
          msg_video_approved: string
          send_signature: boolean
          updated_at: string
        }
        Insert: {
          api_token?: string
          api_token_configured?: boolean
          auto_confirmation?: boolean
          auto_recording_reminder?: boolean
          auto_recording_scheduled?: boolean
          auto_video_approval?: boolean
          auto_video_approved?: boolean
          close_ticket?: boolean
          default_queue_id?: string
          default_user_id?: string
          id?: string
          integration_active?: boolean
          msg_backup_confirmed?: string
          msg_backup_invite?: string
          msg_confirmation?: string
          msg_confirmation_cancelled?: string
          msg_confirmation_confirmed?: string
          msg_recording_reminder?: string
          msg_recording_scheduled?: string
          msg_video_approval?: string
          msg_video_approved?: string
          send_signature?: boolean
          updated_at?: string
        }
        Update: {
          api_token?: string
          api_token_configured?: boolean
          auto_confirmation?: boolean
          auto_recording_reminder?: boolean
          auto_recording_scheduled?: boolean
          auto_video_approval?: boolean
          auto_video_approved?: boolean
          close_ticket?: boolean
          default_queue_id?: string
          default_user_id?: string
          id?: string
          integration_active?: boolean
          msg_backup_confirmed?: string
          msg_backup_invite?: string
          msg_confirmation?: string
          msg_confirmation_cancelled?: string
          msg_confirmation_confirmed?: string
          msg_recording_reminder?: string
          msg_recording_scheduled?: string
          msg_video_approval?: string
          msg_video_approved?: string
          send_signature?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_confirmations: {
        Row: {
          backup_client_ids: string[]
          backup_index: number
          client_id: string
          created_at: string
          id: string
          phone_number: string
          recording_id: string
          responded_at: string | null
          response_message: string | null
          sent_at: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          backup_client_ids?: string[]
          backup_index?: number
          client_id: string
          created_at?: string
          id?: string
          phone_number: string
          recording_id: string
          responded_at?: string | null
          response_message?: string | null
          sent_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          backup_client_ids?: string[]
          backup_index?: number
          client_id?: string
          created_at?: string
          id?: string
          phone_number?: string
          recording_id?: string
          responded_at?: string | null
          response_message?: string | null
          sent_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_confirmations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_confirmations_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          api_response: Json | null
          client_id: string | null
          created_at: string
          id: string
          message: string
          phone_number: string
          sent_at: string
          sent_by: string | null
          status: string
          trigger_type: string
        }
        Insert: {
          api_response?: Json | null
          client_id?: string | null
          created_at?: string
          id?: string
          message: string
          phone_number: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          trigger_type?: string
        }
        Update: {
          api_response?: Json | null
          client_id?: string | null
          created_at?: string
          id?: string
          message?: string
          phone_number?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
