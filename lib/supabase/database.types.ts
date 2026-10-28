// Generado desde el proyecto Supabase (generate_typescript_types). No editar a mano:
// regenerar tras cada migración.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type DossierRow = {
  adults_count: number
  agency_id: string
  agent_id: string
  children_count: number
  client_id: string
  created_at: string
  departure_date: string
  destination_title: string
  dossier_code: string
  electronic_invoice_ref: string | null
  gross_margin: number
  has_minors: boolean | null
  id: string
  iva_margin: number
  liquidated_at: string | null
  net_utility_base: number
  return_date: string
  status: Database["public"]["Enums"]["dossier_status"]
  total_net_cost: number
  total_sale_price: number
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          city: string | null
          created_at: string
          currency: string | null
          id: string
          name: string
          nit: string
          phone: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          name: string
          nit: string
          phone?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          name?: string
          nit?: string
          phone?: string | null
        }
        Relationships: []
      }
      agency_invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string
          commission_rate: number
          created_at: string
          email: string
          full_name: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          commission_rate?: number
          created_at?: string
          email: string
          full_name: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          commission_rate?: number
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      agency_users: {
        Row: {
          agency_id: string
          created_at: string
          default_commission_rate: number
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          agency_id: string
          created_at?: string
          default_commission_rate?: number
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          agency_id?: string
          created_at?: string
          default_commission_rate?: number
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "agency_users_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_commissions: {
        Row: {
          agency_id: string
          agent_id: string
          calculated_amount: number
          commission_percentage: number
          created_at: string
          dossier_id: string
          id: string
          paid_at: string | null
          settlement_batch_id: string | null
          status: Database["public"]["Enums"]["commission_status"]
        }
        Insert: {
          agency_id: string
          agent_id: string
          calculated_amount: number
          commission_percentage: number
          created_at?: string
          dossier_id: string
          id?: string
          paid_at?: string | null
          settlement_batch_id?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Update: {
          agency_id?: string
          agent_id?: string
          calculated_amount?: number
          commission_percentage?: number
          created_at?: string
          dossier_id?: string
          id?: string
          paid_at?: string | null
          settlement_batch_id?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_commissions_agency_id_agent_id_fkey"
            columns: ["agency_id", "agent_id"]
            isOneToOne: false
            referencedRelation: "agency_users"
            referencedColumns: ["agency_id", "id"]
          },
          {
            foreignKeyName: "agent_commissions_agency_id_dossier_id_fkey"
            columns: ["agency_id", "dossier_id"]
            isOneToOne: false
            referencedRelation: "travel_dossiers"
            referencedColumns: ["agency_id", "id"]
          },
        ]
      }
      client_payments: {
        Row: {
          agency_id: string
          amount: number
          dossier_id: string
          id: string
          notes: string | null
          paid_at: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_number: string | null
          receipt_url: string | null
          registered_by: string | null
        }
        Insert: {
          agency_id: string
          amount: number
          dossier_id: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_number?: string | null
          receipt_url?: string | null
          registered_by?: string | null
        }
        Update: {
          agency_id?: string
          amount?: number
          dossier_id?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_number?: string | null
          receipt_url?: string | null
          registered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_agency_id_dossier_id_fkey"
            columns: ["agency_id", "dossier_id"]
            isOneToOne: false
            referencedRelation: "travel_dossiers"
            referencedColumns: ["agency_id", "id"]
          },
          {
            foreignKeyName: "client_payments_agency_id_registered_by_fkey"
            columns: ["agency_id", "registered_by"]
            isOneToOne: false
            referencedRelation: "agency_users"
            referencedColumns: ["agency_id", "id"]
          },
        ]
      }
      clients: {
        Row: {
          agency_id: string
          created_at: string
          document_number: string
          document_type: string
          email: string | null
          full_name: string
          id: string
          whatsapp: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          document_number: string
          document_type?: string
          email?: string | null
          full_name: string
          id?: string
          whatsapp: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          document_number?: string
          document_type?: string
          email?: string | null
          full_name?: string
          id?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_services: {
        Row: {
          agency_id: string
          booking_reference: string | null
          created_at: string
          currency: string
          description: string
          exchange_rate: number
          id: string
          is_provider_paid: boolean
          net_cost: number | null
          net_cost_original: number
          payment_deadline: string | null
          provider_id: string | null
          provider_name: string
          quote_option_id: string
          sale_price: number
          service_type: Database["public"]["Enums"]["service_type"]
          voucher_url: string | null
        }
        Insert: {
          agency_id: string
          booking_reference?: string | null
          created_at?: string
          currency?: string
          description?: string
          exchange_rate?: number
          id?: string
          is_provider_paid?: boolean
          net_cost?: number | null
          net_cost_original?: number
          payment_deadline?: string | null
          provider_id?: string | null
          provider_name: string
          quote_option_id: string
          sale_price?: number
          service_type: Database["public"]["Enums"]["service_type"]
          voucher_url?: string | null
        }
        Update: {
          agency_id?: string
          booking_reference?: string | null
          created_at?: string
          currency?: string
          description?: string
          exchange_rate?: number
          id?: string
          is_provider_paid?: boolean
          net_cost?: number | null
          net_cost_original?: number
          payment_deadline?: string | null
          provider_id?: string | null
          provider_name?: string
          quote_option_id?: string
          sale_price?: number
          service_type?: Database["public"]["Enums"]["service_type"]
          voucher_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_services_agency_id_quote_option_id_fkey"
            columns: ["agency_id", "quote_option_id"]
            isOneToOne: false
            referencedRelation: "quote_options"
            referencedColumns: ["agency_id", "id"]
          },
          {
            foreignKeyName: "dossier_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      providers_catalog: {
        Row: {
          agency_id: string | null
          category: Database["public"]["Enums"]["provider_category"]
          created_at: string
          default_currency: string
          default_puc_account: string
          id: string
          is_system_preload: boolean
          name: string
          nit: string | null
          payment_deadline_hours: number
        }
        Insert: {
          agency_id?: string | null
          category: Database["public"]["Enums"]["provider_category"]
          created_at?: string
          default_currency?: string
          default_puc_account?: string
          id?: string
          is_system_preload?: boolean
          name: string
          nit?: string | null
          payment_deadline_hours?: number
        }
        Update: {
          agency_id?: string | null
          category?: Database["public"]["Enums"]["provider_category"]
          created_at?: string
          default_currency?: string
          default_puc_account?: string
          id?: string
          is_system_preload?: boolean
          name?: string
          nit?: string | null
          payment_deadline_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "providers_catalog_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_options: {
        Row: {
          agency_id: string
          created_at: string
          dossier_id: string
          id: string
          is_archived: boolean
          is_selected: boolean
          option_title: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          dossier_id: string
          id?: string
          is_archived?: boolean
          is_selected?: boolean
          option_title?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          dossier_id?: string
          id?: string
          is_archived?: boolean
          is_selected?: boolean
          option_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_options_agency_id_dossier_id_fkey"
            columns: ["agency_id", "dossier_id"]
            isOneToOne: false
            referencedRelation: "travel_dossiers"
            referencedColumns: ["agency_id", "id"]
          },
        ]
      }
      travel_dossiers: {
        Row: DossierRow
        Insert: {
          adults_count?: number
          agency_id: string
          agent_id: string
          children_count?: number
          client_id: string
          created_at?: string
          departure_date: string
          destination_title: string
          dossier_code: string
          electronic_invoice_ref?: string | null
          gross_margin?: number
          has_minors?: boolean | null
          id?: string
          iva_margin?: number
          liquidated_at?: string | null
          net_utility_base?: number
          return_date: string
          status?: Database["public"]["Enums"]["dossier_status"]
          total_net_cost?: number
          total_sale_price?: number
        }
        Update: Partial<DossierRow>
        Relationships: [
          {
            foreignKeyName: "travel_dossiers_agency_id_agent_id_fkey"
            columns: ["agency_id", "agent_id"]
            isOneToOne: false
            referencedRelation: "agency_users"
            referencedColumns: ["agency_id", "id"]
          },
          {
            foreignKeyName: "travel_dossiers_agency_id_client_id_fkey"
            columns: ["agency_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["agency_id", "id"]
          },
          {
            foreignKeyName: "travel_dossiers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_invitation_id: string }; Returns: string }
      compute_dossier_financials: {
        Args: { p_dossier_id: string }
        Returns: {
          balance_due: number
          gross_margin: number
          iva_generated: number
          net_taxable_base: number
          total_net_cost: number
          total_paid: number
          total_sale: number
          unpaid_providers: number
        }[]
      }
      convert_quote_to_file: {
        Args: { p_dossier_id: string; p_option_id: string }
        Returns: DossierRow
        SetofOptions: {
          from: "*"
          to: "travel_dossiers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_dossier: {
        Args: {
          p_adults?: number
          p_children?: number
          p_client_document: string
          p_client_name: string
          p_client_whatsapp: string
          p_departure: string
          p_return: string
          p_title: string
        }
        Returns: string
      }
      current_agency_id: { Args: never; Returns: string }
      dashboard_alerts: {
        Args: never
        Returns: {
          amount: number | null
          client_name: string
          detail: string | null
          dossier_code: string
          dossier_id: string
          due_at: string | null
          kind: string
          pax: number
          title: string
        }[]
      }
      is_agency_admin: { Args: never; Returns: boolean }
      liquidate_dossier: {
        Args: { p_dossier_id: string }
        Returns: DossierRow
        SetofOptions: {
          from: "*"
          to: "travel_dossiers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_onboarding: {
        Args: never
        Returns: {
          agency_name: string
          commission_rate: number
          invitation_id: string | null
          kind: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      register_agency: {
        Args: { p_agency_name: string; p_full_name: string; p_nit: string }
        Returns: string
      }
      settle_commissions: {
        Args: { p_commission_ids: string[] }
        Returns: string
      }
      sync_dossier_options: {
        Args: { p_dossier_id: string; p_options: Json }
        Returns: undefined
      }
    }
    Enums: {
      commission_status: "HELD" | "RELEASED" | "PAID" | "CANCELLED"
      dossier_status: "DRAFT" | "CONFIRMED" | "IN_PROGRESS" | "LIQUIDATED" | "CANCELLED"
      payment_method: "TRANSFER_BANCOLOMBIA" | "NEQUI_DAVIPLATA" | "CARD_GATEWAY" | "CASH" | "OTHER"
      provider_category: "MAYORISTA" | "CONSOLIDADOR" | "HOTEL" | "ASISTENCIA" | "OPERADOR_LOCAL"
      service_type: "HOTEL" | "FLIGHT" | "PACKAGE" | "ASSISTANCE" | "TRANSFER" | "TOUR"
      user_role: "ADMIN" | "AGENT"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
