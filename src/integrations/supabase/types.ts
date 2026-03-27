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
          planned_script_ids: string[]
          recording_id: string
          started_at: string
          videomaker_id: string
        }
        Insert: {
          client_id: string
          id?: string
          planned_script_ids?: string[]
          recording_id: string
          started_at?: string
          videomaker_id: string
        }
        Update: {
          client_id?: string
          id?: string
          planned_script_ids?: string[]
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
            foreignKeyName: "active_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
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
      api_integration_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          integration_id: string | null
          performed_by: string | null
          status: string
        }
        Insert: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          integration_id?: string | null
          performed_by?: string | null
          status?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          integration_id?: string | null
          performed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_integration_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "api_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_integrations: {
        Row: {
          api_type: string
          config: Json | null
          created_at: string
          created_by: string | null
          endpoint_url: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          name: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          api_type?: string
          config?: Json | null
          created_at?: string
          created_by?: string | null
          endpoint_url?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          name?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_type?: string
          config?: Json | null
          created_at?: string
          created_by?: string | null
          endpoint_url?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          name?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          edges: Json
          id: string
          is_active: boolean
          name: string
          nodes: Json
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          completed_at: string | null
          error: string | null
          flow_id: string
          id: string
          result: Json | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          flow_id: string
          id?: string
          result?: Json | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          flow_id?: string
          id?: string
          result?: Json | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_triggered_by_fkey"
            columns: ["triggered_by"]
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
            foreignKeyName: "billing_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
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
      client_endomarketing_contracts: {
        Row: {
          client_id: string
          created_at: string
          id: string
          package_id: string
          partner_cost: number
          partner_id: string | null
          sale_price: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          package_id: string
          partner_cost?: number
          partner_id?: string | null
          sale_price?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          package_id?: string
          partner_cost?: number
          partner_id?: string | null
          sale_price?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_endomarketing_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_endomarketing_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_endomarketing_contracts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "endomarketing_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_endomarketing_contracts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_comments: {
        Row: {
          author_id: string | null
          author_name: string
          author_type: string
          content_id: string
          created_at: string
          id: string
          message: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          author_type?: string
          content_id: string
          created_at?: string
          id?: string
          message?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          author_type?: string
          content_id?: string
          created_at?: string
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "client_portal_contents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_contents: {
        Row: {
          approved_at: string | null
          client_id: string
          content_type: string
          created_at: string
          duration_seconds: number | null
          file_url: string | null
          id: string
          season_month: number
          season_year: number
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          approved_at?: string | null
          client_id: string
          content_type?: string
          created_at?: string
          duration_seconds?: number | null
          file_url?: string | null
          id?: string
          season_month: number
          season_year: number
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          approved_at?: string | null
          client_id?: string
          content_type?: string
          created_at?: string
          duration_seconds?: number | null
          file_url?: string | null
          id?: string
          season_month?: number
          season_year?: number
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_contents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_contents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_contents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_notifications: {
        Row: {
          client_id: string
          created_at: string
          id: string
          link_content_id: string | null
          link_script_id: string | null
          message: string
          read: boolean
          title: string
          type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          link_content_id?: string | null
          link_script_id?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          link_content_id?: string | null
          link_script_id?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_notifications_link_content_id_fkey"
            columns: ["link_content_id"]
            isOneToOne: false
            referencedRelation: "client_portal_contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_notifications_link_script_id_fkey"
            columns: ["link_script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_testimonials: {
        Row: {
          approved_at: string | null
          client_name: string
          client_role: string
          created_at: string
          id: string
          message: string
          rating: number
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          client_name?: string
          client_role?: string
          created_at?: string
          id?: string
          message?: string
          rating?: number
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          client_name?: string
          client_role?: string
          created_at?: string
          id?: string
          message?: string
          rating?: number
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          accepts_extra: boolean
          accepts_photo_shoot_cost: boolean
          art_requests_limit: number | null
          auto_renewal: boolean
          backup_day: string
          backup_time: string
          briefing_data: Json | null
          city: string
          client_login: string | null
          client_password_hash: string | null
          client_type: string
          color: string
          company_name: string
          contract_duration_months: number
          contract_start_date: string | null
          created_at: string
          drive_fotos: string | null
          drive_identidade_visual: string | null
          drive_link: string | null
          editorial: string | null
          email: string
          extra_client_appears: boolean
          extra_content_types: string[]
          extra_day: string
          fixed_day: string
          fixed_time: string
          full_shift_recording: boolean
          has_endomarketing: boolean
          has_photo_shoot: boolean
          has_vehicle_flyer: boolean
          id: string
          logo_url: string | null
          monthly_recordings: number
          niche: string | null
          onboarding_completed: boolean | null
          phone: string
          photo_preference: string
          plan_id: string | null
          preferred_shift: string
          presence_days: number
          responsible_person: string
          selected_weeks: number[]
          show_metrics: boolean
          updated_at: string
          videomaker_id: string | null
          weekly_creatives: number
          weekly_goal: number
          weekly_reels: number
          weekly_stories: number
          whatsapp: string
          whatsapp_group: string | null
        }
        Insert: {
          accepts_extra?: boolean
          accepts_photo_shoot_cost?: boolean
          art_requests_limit?: number | null
          auto_renewal?: boolean
          backup_day?: string
          backup_time?: string
          briefing_data?: Json | null
          city?: string
          client_login?: string | null
          client_password_hash?: string | null
          client_type?: string
          color?: string
          company_name: string
          contract_duration_months?: number
          contract_start_date?: string | null
          created_at?: string
          drive_fotos?: string | null
          drive_identidade_visual?: string | null
          drive_link?: string | null
          editorial?: string | null
          email?: string
          extra_client_appears?: boolean
          extra_content_types?: string[]
          extra_day?: string
          fixed_day?: string
          fixed_time?: string
          full_shift_recording?: boolean
          has_endomarketing?: boolean
          has_photo_shoot?: boolean
          has_vehicle_flyer?: boolean
          id?: string
          logo_url?: string | null
          monthly_recordings?: number
          niche?: string | null
          onboarding_completed?: boolean | null
          phone?: string
          photo_preference?: string
          plan_id?: string | null
          preferred_shift?: string
          presence_days?: number
          responsible_person?: string
          selected_weeks?: number[]
          show_metrics?: boolean
          updated_at?: string
          videomaker_id?: string | null
          weekly_creatives?: number
          weekly_goal?: number
          weekly_reels?: number
          weekly_stories?: number
          whatsapp?: string
          whatsapp_group?: string | null
        }
        Update: {
          accepts_extra?: boolean
          accepts_photo_shoot_cost?: boolean
          art_requests_limit?: number | null
          auto_renewal?: boolean
          backup_day?: string
          backup_time?: string
          briefing_data?: Json | null
          city?: string
          client_login?: string | null
          client_password_hash?: string | null
          client_type?: string
          color?: string
          company_name?: string
          contract_duration_months?: number
          contract_start_date?: string | null
          created_at?: string
          drive_fotos?: string | null
          drive_identidade_visual?: string | null
          drive_link?: string | null
          editorial?: string | null
          email?: string
          extra_client_appears?: boolean
          extra_content_types?: string[]
          extra_day?: string
          fixed_day?: string
          fixed_time?: string
          full_shift_recording?: boolean
          has_endomarketing?: boolean
          has_photo_shoot?: boolean
          has_vehicle_flyer?: boolean
          id?: string
          logo_url?: string | null
          monthly_recordings?: number
          niche?: string | null
          onboarding_completed?: boolean | null
          phone?: string
          photo_preference?: string
          plan_id?: string | null
          preferred_shift?: string
          presence_days?: number
          responsible_person?: string
          selected_weeks?: number[]
          show_metrics?: boolean
          updated_at?: string
          videomaker_id?: string | null
          weekly_creatives?: number
          weekly_goal?: number
          weekly_reels?: number
          weekly_stories?: number
          whatsapp?: string
          whatsapp_group?: string | null
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
      commercial_proposals: {
        Row: {
          bonus_services: Json | null
          client_company: string
          client_name: string
          client_response_at: string | null
          client_response_note: string | null
          created_at: string
          created_by: string | null
          custom_discount: number
          endomarketing_data: Json | null
          has_contract: boolean
          id: string
          observations: string | null
          plan_id: string | null
          plan_snapshot: Json | null
          proposal_type: string
          status: string
          system_data: Json | null
          team_members: Json | null
          token: string
          updated_at: string
          validity_date: string
          whatsapp_number: string | null
        }
        Insert: {
          bonus_services?: Json | null
          client_company?: string
          client_name?: string
          client_response_at?: string | null
          client_response_note?: string | null
          created_at?: string
          created_by?: string | null
          custom_discount?: number
          endomarketing_data?: Json | null
          has_contract?: boolean
          id?: string
          observations?: string | null
          plan_id?: string | null
          plan_snapshot?: Json | null
          proposal_type?: string
          status?: string
          system_data?: Json | null
          team_members?: Json | null
          token?: string
          updated_at?: string
          validity_date?: string
          whatsapp_number?: string | null
        }
        Update: {
          bonus_services?: Json | null
          client_company?: string
          client_name?: string
          client_response_at?: string | null
          client_response_note?: string | null
          created_at?: string
          created_by?: string | null
          custom_discount?: number
          endomarketing_data?: Json | null
          has_contract?: boolean
          id?: string
          observations?: string | null
          plan_id?: string | null
          plan_snapshot?: Json | null
          proposal_type?: string
          status?: string
          system_data?: Json | null
          team_members?: Json | null
          token?: string
          updated_at?: string
          validity_date?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_proposals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          alteration_deadline_enabled: boolean
          alteration_deadline_hours: number
          approval_deadline_enabled: boolean
          approval_deadline_hours: number
          editing_deadline_enabled: boolean
          editing_deadline_hours: number
          id: string
          recording_duration: number
          review_deadline_enabled: boolean
          review_deadline_hours: number
          shift_a_end: string
          shift_a_start: string
          shift_b_end: string
          shift_b_start: string
          updated_at: string
          work_days: string[]
        }
        Insert: {
          alteration_deadline_enabled?: boolean
          alteration_deadline_hours?: number
          approval_deadline_enabled?: boolean
          approval_deadline_hours?: number
          editing_deadline_enabled?: boolean
          editing_deadline_hours?: number
          id?: string
          recording_duration?: number
          review_deadline_enabled?: boolean
          review_deadline_hours?: number
          shift_a_end?: string
          shift_a_start?: string
          shift_b_end?: string
          shift_b_start?: string
          updated_at?: string
          work_days?: string[]
        }
        Update: {
          alteration_deadline_enabled?: boolean
          alteration_deadline_hours?: number
          approval_deadline_enabled?: boolean
          approval_deadline_hours?: number
          editing_deadline_enabled?: boolean
          editing_deadline_hours?: number
          id?: string
          recording_duration?: number
          review_deadline_enabled?: boolean
          review_deadline_hours?: number
          shift_a_end?: string
          shift_a_start?: string
          shift_b_end?: string
          shift_b_start?: string
          updated_at?: string
          work_days?: string[]
        }
        Relationships: []
      }
      content_tasks: {
        Row: {
          adjustment_notes: string | null
          alteration_deadline: string | null
          approval_deadline: string | null
          approval_sent_at: string | null
          approved_at: string | null
          assigned_to: string | null
          client_id: string | null
          content_type: string
          created_at: string
          created_by: string | null
          description: string | null
          drive_link: string | null
          edited_by: string | null
          edited_video_link: string | null
          edited_video_type: string | null
          editing_deadline: string | null
          editing_paused_at: string | null
          editing_paused_seconds: number
          editing_priority: boolean
          editing_started_at: string | null
          id: string
          immediate_alteration: boolean
          kanban_column: string
          position: number
          recording_id: string | null
          review_deadline: string | null
          reviewing_at: string | null
          reviewing_by: string | null
          reviewing_by_name: string | null
          scheduled_recording_date: string | null
          scheduled_recording_time: string | null
          script_alteration_notes: string | null
          script_alteration_type: string | null
          script_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          adjustment_notes?: string | null
          alteration_deadline?: string | null
          approval_deadline?: string | null
          approval_sent_at?: string | null
          approved_at?: string | null
          assigned_to?: string | null
          client_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          drive_link?: string | null
          edited_by?: string | null
          edited_video_link?: string | null
          edited_video_type?: string | null
          editing_deadline?: string | null
          editing_paused_at?: string | null
          editing_paused_seconds?: number
          editing_priority?: boolean
          editing_started_at?: string | null
          id?: string
          immediate_alteration?: boolean
          kanban_column?: string
          position?: number
          recording_id?: string | null
          review_deadline?: string | null
          reviewing_at?: string | null
          reviewing_by?: string | null
          reviewing_by_name?: string | null
          scheduled_recording_date?: string | null
          scheduled_recording_time?: string | null
          script_alteration_notes?: string | null
          script_alteration_type?: string | null
          script_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          adjustment_notes?: string | null
          alteration_deadline?: string | null
          approval_deadline?: string | null
          approval_sent_at?: string | null
          approved_at?: string | null
          assigned_to?: string | null
          client_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          drive_link?: string | null
          edited_by?: string | null
          edited_video_link?: string | null
          edited_video_type?: string | null
          editing_deadline?: string | null
          editing_paused_at?: string | null
          editing_paused_seconds?: number
          editing_priority?: boolean
          editing_started_at?: string | null
          id?: string
          immediate_alteration?: boolean
          kanban_column?: string
          position?: number
          recording_id?: string | null
          review_deadline?: string | null
          reviewing_at?: string | null
          reviewing_by?: string | null
          reviewing_by_name?: string | null
          scheduled_recording_date?: string | null
          scheduled_recording_time?: string | null
          script_alteration_notes?: string | null
          script_alteration_type?: string | null
          script_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "delivery_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
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
      design_task_history: {
        Row: {
          action: string
          attachment_url: string | null
          created_at: string
          details: string | null
          id: string
          task_id: string
          user_id: string | null
        }
        Insert: {
          action?: string
          attachment_url?: string | null
          created_at?: string
          details?: string | null
          id?: string
          task_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          attachment_url?: string | null
          created_at?: string
          details?: string | null
          id?: string
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "design_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_task_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      design_tasks: {
        Row: {
          assigned_to: string | null
          attachment_url: string | null
          auto_approved: boolean
          checklist: Json | null
          client_approved_at: string | null
          client_id: string
          completed_at: string | null
          copy_text: string | null
          created_at: string
          created_by: string | null
          description: string | null
          editable_file_url: string | null
          format_type: string
          id: string
          kanban_column: string
          mockup_url: string | null
          observations: string | null
          priority: string
          reference_images: string[] | null
          references_links: string[] | null
          sent_to_client_at: string | null
          started_at: string | null
          time_spent_seconds: number
          timer_running: boolean
          timer_started_at: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          assigned_to?: string | null
          attachment_url?: string | null
          auto_approved?: boolean
          checklist?: Json | null
          client_approved_at?: string | null
          client_id: string
          completed_at?: string | null
          copy_text?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          editable_file_url?: string | null
          format_type?: string
          id?: string
          kanban_column?: string
          mockup_url?: string | null
          observations?: string | null
          priority?: string
          reference_images?: string[] | null
          references_links?: string[] | null
          sent_to_client_at?: string | null
          started_at?: string | null
          time_spent_seconds?: number
          timer_running?: boolean
          timer_started_at?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_to?: string | null
          attachment_url?: string | null
          auto_approved?: boolean
          checklist?: Json | null
          client_approved_at?: string | null
          client_id?: string
          completed_at?: string | null
          copy_text?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          editable_file_url?: string | null
          format_type?: string
          id?: string
          kanban_column?: string
          mockup_url?: string | null
          observations?: string | null
          priority?: string
          reference_images?: string[] | null
          references_links?: string[] | null
          sent_to_client_at?: string | null
          started_at?: string | null
          time_spent_seconds?: number
          timer_running?: boolean
          timer_started_at?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_tasks_created_by_fkey"
            columns: ["created_by"]
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
      endomarketing_packages: {
        Row: {
          category: string
          created_at: string
          description: string | null
          duration_hours: number
          id: string
          package_name: string
          partner_cost: number
          sessions_per_week: number
          stories_per_day: number
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          duration_hours?: number
          id?: string
          package_name: string
          partner_cost?: number
          sessions_per_week?: number
          stories_per_day?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration_hours?: number
          id?: string
          package_name?: string
          partner_cost?: number
          sessions_per_week?: number
          stories_per_day?: number
        }
        Relationships: []
      }
      endomarketing_partner_tasks: {
        Row: {
          attachment_url: string | null
          client_id: string
          completed_at: string | null
          contract_id: string
          created_at: string
          date: string
          duration_minutes: number
          id: string
          notes: string | null
          partner_id: string | null
          start_time: string | null
          status: string
          task_type: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          client_id: string
          completed_at?: string | null
          contract_id: string
          created_at?: string
          date: string
          duration_minutes?: number
          id?: string
          notes?: string | null
          partner_id?: string | null
          start_time?: string | null
          status?: string
          task_type?: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          client_id?: string
          completed_at?: string | null
          contract_id?: string
          created_at?: string
          date?: string
          duration_minutes?: number
          id?: string
          notes?: string | null
          partner_id?: string | null
          start_time?: string | null
          status?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "endomarketing_partner_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endomarketing_partner_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endomarketing_partner_tasks_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_endomarketing_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endomarketing_partner_tasks_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      event_recordings: {
        Row: {
          address: string
          client_id: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          end_time: string
          id: string
          start_time: string
          status: string
          title: string
          updated_at: string
          videomaker_id: string | null
        }
        Insert: {
          address?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          end_time?: string
          id?: string
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
          videomaker_id?: string | null
        }
        Update: {
          address?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          end_time?: string
          id?: string
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
          videomaker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_recordings_videomaker_id_fkey"
            columns: ["videomaker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      financial_activity_log: {
        Row: {
          action_type: string
          created_at: string
          description: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action_type?: string
          created_at?: string
          description?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      financial_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
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
            foreignKeyName: "financial_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_public_logos"
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
      flyer_items: {
        Row: {
          client_id: string
          created_at: string
          extra_info: string | null
          fuel_type: string
          generated_image_url: string | null
          generated_video_url: string | null
          id: string
          media_urls: string[]
          price: string
          status: string
          template_id: string | null
          tire_condition: string
          transmission: string
          updated_at: string
          vehicle_model: string
          vehicle_year: string
        }
        Insert: {
          client_id: string
          created_at?: string
          extra_info?: string | null
          fuel_type?: string
          generated_image_url?: string | null
          generated_video_url?: string | null
          id?: string
          media_urls?: string[]
          price?: string
          status?: string
          template_id?: string | null
          tire_condition?: string
          transmission?: string
          updated_at?: string
          vehicle_model?: string
          vehicle_year?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          extra_info?: string | null
          fuel_type?: string
          generated_image_url?: string | null
          generated_video_url?: string | null
          id?: string
          media_urls?: string[]
          price?: string
          status?: string
          template_id?: string | null
          tire_condition?: string
          transmission?: string
          updated_at?: string
          vehicle_model?: string
          vehicle_year?: string
        }
        Relationships: [
          {
            foreignKeyName: "flyer_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flyer_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flyer_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "flyer_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      flyer_templates: {
        Row: {
          created_at: string
          file_url: string
          id: string
          is_active: boolean
          name: string
          preview_url: string | null
          template_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_url?: string
          id?: string
          is_active?: boolean
          name?: string
          preview_url?: string | null
          template_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          is_active?: boolean
          name?: string
          preview_url?: string | null
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          current_value: number
          end_date: string
          id: string
          notes: string | null
          period: string
          start_date: string
          status: string
          target_value: number
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          end_date?: string
          id?: string
          notes?: string | null
          period?: string
          start_date?: string
          status?: string
          target_value?: number
          title?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: number
          end_date?: string
          id?: string
          notes?: string | null
          period?: string
          start_date?: string
          status?: string
          target_value?: number
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          action: string
          client_id: string
          created_at: string
          id: string
          message: string
          platform: string
          status: string
        }
        Insert: {
          action?: string
          client_id: string
          created_at?: string
          id?: string
          message?: string
          platform?: string
          status?: string
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string
          id?: string
          message?: string
          platform?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
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
          {
            foreignKeyName: "kanban_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_settings: {
        Row: {
          description: string | null
          id: string
          section: string
          title: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          section: string
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          section?: string
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_tasks: {
        Row: {
          assigned_to: string | null
          briefing_completed: boolean | null
          briefing_data: Json | null
          client_id: string
          completed_at: string | null
          contract_sent: boolean | null
          contract_signed: boolean | null
          contract_url: string | null
          created_at: string
          description: string | null
          drive_link: string | null
          id: string
          photo_warning_shown: boolean | null
          stage: string
          status: string
          title: string
          updated_at: string
          use_real_photos: boolean | null
          wants_new_identity: boolean | null
        }
        Insert: {
          assigned_to?: string | null
          briefing_completed?: boolean | null
          briefing_data?: Json | null
          client_id: string
          completed_at?: string | null
          contract_sent?: boolean | null
          contract_signed?: boolean | null
          contract_url?: string | null
          created_at?: string
          description?: string | null
          drive_link?: string | null
          id?: string
          photo_warning_shown?: boolean | null
          stage?: string
          status?: string
          title?: string
          updated_at?: string
          use_real_photos?: boolean | null
          wants_new_identity?: boolean | null
        }
        Update: {
          assigned_to?: string | null
          briefing_completed?: boolean | null
          briefing_data?: Json | null
          client_id?: string
          completed_at?: string | null
          contract_sent?: boolean | null
          contract_signed?: boolean | null
          contract_url?: string | null
          created_at?: string
          description?: string | null
          drive_link?: string | null
          id?: string
          photo_warning_shown?: boolean | null
          stage?: string
          status?: string
          title?: string
          updated_at?: string
          use_real_photos?: boolean | null
          wants_new_identity?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          active: boolean
          company_name: string | null
          created_at: string
          fixed_rate: number
          id: string
          notes: string | null
          phone: string | null
          service_function: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          company_name?: string | null
          created_at?: string
          fixed_rate?: number
          id?: string
          notes?: string | null
          phone?: string | null
          service_function?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          company_name?: string | null
          created_at?: string
          fixed_rate?: number
          id?: string
          notes?: string | null
          phone?: string | null
          service_function?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_config: {
        Row: {
          bank: string
          document: string
          id: string
          include_delivery_report: boolean
          msg_billing_due: string
          msg_billing_overdue: string
          msg_delivery_report: string
          msg_payment_data: string
          pix_key: string
          receiver_name: string
          updated_at: string
        }
        Insert: {
          bank?: string
          document?: string
          id?: string
          include_delivery_report?: boolean
          msg_billing_due?: string
          msg_billing_overdue?: string
          msg_delivery_report?: string
          msg_payment_data?: string
          pix_key?: string
          receiver_name?: string
          updated_at?: string
        }
        Update: {
          bank?: string
          document?: string
          id?: string
          include_delivery_report?: boolean
          msg_billing_due?: string
          msg_billing_overdue?: string
          msg_delivery_report?: string
          msg_payment_data?: string
          pix_key?: string
          receiver_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_videos: {
        Row: {
          id: string
          plan_name: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          id?: string
          plan_name: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          id?: string
          plan_name?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          accepts_extra_content: boolean
          arts_qty: number
          created_at: string
          creatives_qty: number
          description: string
          extra_content_allowed: number
          has_photography: boolean
          has_recording: boolean
          id: string
          is_partner_plan: boolean
          name: string
          partner_cost: number
          partner_id: string | null
          periodicity: string
          plan_type: string
          price: number
          recording_hours: number
          recording_sessions: number
          reels_qty: number
          services: Json
          status: string
          stories_qty: number
          updated_at: string
        }
        Insert: {
          accepts_extra_content?: boolean
          arts_qty?: number
          created_at?: string
          creatives_qty?: number
          description?: string
          extra_content_allowed?: number
          has_photography?: boolean
          has_recording?: boolean
          id?: string
          is_partner_plan?: boolean
          name: string
          partner_cost?: number
          partner_id?: string | null
          periodicity?: string
          plan_type?: string
          price?: number
          recording_hours?: number
          recording_sessions?: number
          reels_qty?: number
          services?: Json
          status?: string
          stories_qty?: number
          updated_at?: string
        }
        Update: {
          accepts_extra_content?: boolean
          arts_qty?: number
          created_at?: string
          creatives_qty?: number
          description?: string
          extra_content_allowed?: number
          has_photography?: boolean
          has_recording?: boolean
          id?: string
          is_partner_plan?: boolean
          name?: string
          partner_cost?: number
          partner_id?: string | null
          periodicity?: string
          plan_type?: string
          price?: number
          recording_hours?: number
          recording_sessions?: number
          reels_qty?: number
          services?: Json
          status?: string
          stories_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_video_views: {
        Row: {
          client_id: string
          id: string
          video_id: string
          viewed_at: string
        }
        Insert: {
          client_id: string
          id?: string
          video_id: string
          viewed_at?: string
        }
        Update: {
          client_id?: string
          id?: string
          video_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_video_views_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_video_views_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_video_views_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "portal_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_videos: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_type: string
          video_url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_type?: string
          video_url?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_type?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birthday: string | null
          created_at: string
          display_name: string | null
          email: string
          font_scale: string | null
          id: string
          job_title: string | null
          name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birthday?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          font_scale?: string | null
          id: string
          job_title?: string | null
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birthday?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          font_scale?: string | null
          id?: string
          job_title?: string | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      proposal_comments: {
        Row: {
          author_name: string
          created_at: string
          id: string
          message: string
          proposal_id: string
        }
        Insert: {
          author_name?: string
          created_at?: string
          id?: string
          message?: string
          proposal_id: string
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          message?: string
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_comments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "commercial_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_wait_logs: {
        Row: {
          client_id: string
          created_at: string
          ended_at: string | null
          id: string
          recording_id: string
          started_at: string
          videomaker_id: string
          wait_duration_seconds: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          recording_id: string
          started_at?: string
          videomaker_id: string
          wait_duration_seconds?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          recording_id?: string
          started_at?: string
          videomaker_id?: string
          wait_duration_seconds?: number | null
        }
        Relationships: []
      }
      recordings: {
        Row: {
          client_id: string | null
          confirmation_status: string
          created_at: string
          date: string
          id: string
          prospect_name: string | null
          start_time: string
          status: string
          type: string
          videomaker_id: string
          wait_ended_at: string | null
          wait_started_at: string | null
        }
        Insert: {
          client_id?: string | null
          confirmation_status?: string
          created_at?: string
          date: string
          id?: string
          prospect_name?: string | null
          start_time: string
          status?: string
          type?: string
          videomaker_id: string
          wait_ended_at?: string | null
          wait_started_at?: string | null
        }
        Update: {
          client_id?: string | null
          confirmation_status?: string
          created_at?: string
          date?: string
          id?: string
          prospect_name?: string | null
          start_time?: string
          status?: string
          type?: string
          videomaker_id?: string
          wait_ended_at?: string | null
          wait_started_at?: string | null
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
            foreignKeyName: "recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
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
            foreignKeyName: "revenues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
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
          caption: string | null
          client_id: string | null
          client_priority: string
          content: string
          content_format: string
          created_at: string
          created_by: string | null
          direct_to_editing: boolean
          endo_client_id: string | null
          event_recording_id: string | null
          id: string
          is_endomarketing: boolean
          priority: string
          recorded: boolean
          recording_id: string | null
          scheduled_date: string | null
          title: string
          updated_at: string
          video_type: string
        }
        Insert: {
          caption?: string | null
          client_id?: string | null
          client_priority?: string
          content?: string
          content_format?: string
          created_at?: string
          created_by?: string | null
          direct_to_editing?: boolean
          endo_client_id?: string | null
          event_recording_id?: string | null
          id?: string
          is_endomarketing?: boolean
          priority?: string
          recorded?: boolean
          recording_id?: string | null
          scheduled_date?: string | null
          title: string
          updated_at?: string
          video_type?: string
        }
        Update: {
          caption?: string | null
          client_id?: string | null
          client_priority?: string
          content?: string
          content_format?: string
          created_at?: string
          created_by?: string | null
          direct_to_editing?: boolean
          endo_client_id?: string | null
          event_recording_id?: string | null
          id?: string
          is_endomarketing?: boolean
          priority?: string
          recorded?: boolean
          recording_id?: string | null
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
            foreignKeyName: "scripts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_endo_client_id_fkey"
            columns: ["endo_client_id"]
            isOneToOne: false
            referencedRelation: "endomarketing_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_event_recording_id_fkey"
            columns: ["event_recording_id"]
            isOneToOne: false
            referencedRelation: "event_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token: string
          account_name: string
          client_id: string
          created_at: string
          facebook_page_id: string | null
          id: string
          instagram_business_id: string | null
          platform: string
          status: string
          token_expiration: string | null
        }
        Insert: {
          access_token?: string
          account_name?: string
          client_id: string
          created_at?: string
          facebook_page_id?: string | null
          id?: string
          instagram_business_id?: string | null
          platform?: string
          status?: string
          token_expiration?: string | null
        }
        Update: {
          access_token?: string
          account_name?: string
          client_id?: string
          created_at?: string
          facebook_page_id?: string | null
          id?: string
          instagram_business_id?: string | null
          platform?: string
          status?: string
          token_expiration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media_deliveries: {
        Row: {
          client_id: string
          content_task_id: string | null
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
          content_task_id?: string | null
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
          content_task_id?: string | null
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
            foreignKeyName: "social_media_deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_deliveries_content_task_id_fkey"
            columns: ["content_task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
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
      task_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          task_id: string
          user_id: string | null
        }
        Insert: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          task_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_campaigns: {
        Row: {
          budget: number | null
          campaign_end_date: string | null
          campaign_start_date: string | null
          client_id: string
          content_task_id: string | null
          content_type: string
          created_at: string
          created_by: string | null
          design_task_id: string | null
          id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          campaign_end_date?: string | null
          campaign_start_date?: string | null
          client_id: string
          content_task_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          design_task_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          campaign_end_date?: string | null
          campaign_start_date?: string | null
          client_id?: string
          content_task_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          design_task_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "traffic_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_campaigns_content_task_id_fkey"
            columns: ["content_task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_campaigns_design_task_id_fkey"
            columns: ["design_task_id"]
            isOneToOne: false
            referencedRelation: "design_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          granted_at: string
          id: string
          module: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          module: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          module?: string
          user_id?: string
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
      whatsapp_config: {
        Row: {
          api_token: string
          api_token_configured: boolean
          auto_approval_expired: boolean
          auto_confirmation: boolean
          auto_recording_reminder: boolean
          auto_recording_scheduled: boolean
          auto_task_approved: boolean
          auto_task_editing: boolean
          auto_video_approval: boolean
          auto_video_approved: boolean
          close_ticket: boolean
          default_queue_id: string
          default_user_id: string
          id: string
          integration_active: boolean
          msg_approval_expired: string
          msg_backup_confirmed: string
          msg_backup_invite: string
          msg_confirmation: string
          msg_confirmation_cancelled: string
          msg_confirmation_confirmed: string
          msg_recording_reminder: string
          msg_recording_scheduled: string
          msg_task_approved: string
          msg_task_editing: string
          msg_video_approval: string
          msg_video_approved: string
          send_signature: boolean
          updated_at: string
        }
        Insert: {
          api_token?: string
          api_token_configured?: boolean
          auto_approval_expired?: boolean
          auto_confirmation?: boolean
          auto_recording_reminder?: boolean
          auto_recording_scheduled?: boolean
          auto_task_approved?: boolean
          auto_task_editing?: boolean
          auto_video_approval?: boolean
          auto_video_approved?: boolean
          close_ticket?: boolean
          default_queue_id?: string
          default_user_id?: string
          id?: string
          integration_active?: boolean
          msg_approval_expired?: string
          msg_backup_confirmed?: string
          msg_backup_invite?: string
          msg_confirmation?: string
          msg_confirmation_cancelled?: string
          msg_confirmation_confirmed?: string
          msg_recording_reminder?: string
          msg_recording_scheduled?: string
          msg_task_approved?: string
          msg_task_editing?: string
          msg_video_approval?: string
          msg_video_approved?: string
          send_signature?: boolean
          updated_at?: string
        }
        Update: {
          api_token?: string
          api_token_configured?: boolean
          auto_approval_expired?: boolean
          auto_confirmation?: boolean
          auto_recording_reminder?: boolean
          auto_recording_scheduled?: boolean
          auto_task_approved?: boolean
          auto_task_editing?: boolean
          auto_video_approval?: boolean
          auto_video_approved?: boolean
          close_ticket?: boolean
          default_queue_id?: string
          default_user_id?: string
          id?: string
          integration_active?: boolean
          msg_approval_expired?: string
          msg_backup_confirmed?: string
          msg_backup_invite?: string
          msg_confirmation?: string
          msg_confirmation_cancelled?: string
          msg_confirmation_confirmed?: string
          msg_recording_reminder?: string
          msg_recording_scheduled?: string
          msg_task_approved?: string
          msg_task_editing?: string
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
            foreignKeyName: "whatsapp_confirmations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
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
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public_logos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clients_public_logos: {
        Row: {
          color: string | null
          company_name: string | null
          id: string | null
          logo_url: string | null
        }
        Insert: {
          color?: string | null
          company_name?: string | null
          id?: string | null
          logo_url?: string | null
        }
        Update: {
          color?: string | null
          company_name?: string | null
          id?: string | null
          logo_url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_client_by_login: { Args: { p_login: string }; Returns: string }
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
      notify_role: {
        Args: {
          _link?: string
          _message: string
          _role: Database["public"]["Enums"]["app_role"]
          _title: string
          _type: string
        }
        Returns: undefined
      }
      notify_user: {
        Args: {
          _link?: string
          _message: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "videomaker"
        | "social_media"
        | "editor"
        | "endomarketing"
        | "parceiro"
        | "fotografo"
        | "designer"
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
        "parceiro",
        "fotografo",
        "designer",
      ],
    },
  },
} as const
