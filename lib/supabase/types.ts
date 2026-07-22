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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      booking: {
        Row: {
          balance_cents: number | null
          business_id: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          date: string | null
          deposit_cents: number | null
          id: string
          item_description: string | null
          party_size: number | null
          pickup_at: string | null
          source: Database["public"]["Enums"]["order_source"] | null
          status: Database["public"]["Enums"]["booking_status"]
          time: string | null
          type: Database["public"]["Enums"]["booking_type"]
          updated_at: string
        }
        Insert: {
          balance_cents?: number | null
          business_id: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          date?: string | null
          deposit_cents?: number | null
          id?: string
          item_description?: string | null
          party_size?: number | null
          pickup_at?: string | null
          source?: Database["public"]["Enums"]["order_source"] | null
          status?: Database["public"]["Enums"]["booking_status"]
          time?: string | null
          type: Database["public"]["Enums"]["booking_type"]
          updated_at?: string
        }
        Update: {
          balance_cents?: number | null
          business_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          date?: string | null
          deposit_cents?: number | null
          id?: string
          item_description?: string | null
          party_size?: number | null
          pickup_at?: string | null
          source?: Database["public"]["Enums"]["order_source"] | null
          status?: Database["public"]["Enums"]["booking_status"]
          time?: string | null
          type?: Database["public"]["Enums"]["booking_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_customer_id_business_id_fkey"
            columns: ["customer_id", "business_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      business: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          id: string
          locale_default: Database["public"]["Enums"]["app_language"]
          logo_url: string | null
          name: string
          notification_preferences: Json
          order_seq: number
          phone: string | null
          tax_config: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          id?: string
          locale_default?: Database["public"]["Enums"]["app_language"]
          logo_url?: string | null
          name: string
          notification_preferences?: Json
          order_seq?: number
          phone?: string | null
          tax_config?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          id?: string
          locale_default?: Database["public"]["Enums"]["app_language"]
          logo_url?: string | null
          name?: string
          notification_preferences?: Json
          order_seq?: number
          phone?: string | null
          tax_config?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      commission_rule: {
        Row: {
          business_id: string
          created_at: string
          id: string
          rate_bps: number
          source: Database["public"]["Enums"]["order_source"]
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          rate_bps?: number
          source: Database["public"]["Enums"]["order_source"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          rate_bps?: number
          source?: Database["public"]["Enums"]["order_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rule_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
        ]
      }
      customer: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
        ]
      }
      employee: {
        Row: {
          business_id: string
          created_at: string
          daily_pay_cents: number | null
          id: string
          name: string
          permissions: Json
          profile_id: string | null
          role: string | null
          shift_schedule: Json
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          daily_pay_cents?: number | null
          id?: string
          name: string
          permissions?: Json
          profile_id?: string | null
          role?: string | null
          shift_schedule?: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          daily_pay_cents?: number | null
          id?: string
          name?: string
          permissions?: Json
          profile_id?: string | null
          role?: string | null
          shift_schedule?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      expense: {
        Row: {
          amount_cents: number
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          date: string
          id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          business_id: string
          category: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item: {
        Row: {
          barcode: string | null
          business_id: string
          category: Database["public"]["Enums"]["inventory_category"]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["inventory_kind"]
          low_stock_threshold: number
          name: string
          qty_on_hand: number
          sale_price_cents: number | null
          sku: string | null
          unit: string
          unit_cost_cents: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          business_id: string
          category?: Database["public"]["Enums"]["inventory_category"]
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["inventory_kind"]
          low_stock_threshold?: number
          name: string
          qty_on_hand?: number
          sale_price_cents?: number | null
          sku?: string | null
          unit?: string
          unit_cost_cents?: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          business_id?: string
          category?: Database["public"]["Enums"]["inventory_category"]
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["inventory_kind"]
          low_stock_threshold?: number
          name?: string
          qty_on_hand?: number
          sale_price_cents?: number | null
          sku?: string | null
          unit?: string
          unit_cost_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item: {
        Row: {
          business_id: string
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          is_available: boolean
          item_code: number
          name: string
          price_cents: number
          tracked_inventory_item_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          item_code?: number
          name: string
          price_cents?: number
          tracked_inventory_item_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          item_code?: number
          name?: string
          price_cents?: number
          tracked_inventory_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_tracked_good_fk"
            columns: ["tracked_inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "inventory_item"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "menu_item_tracked_good_fk"
            columns: ["tracked_inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "menu_item_tracked_good_fk"
            columns: ["tracked_inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "merchandise_sale_price"
            referencedColumns: ["inventory_item_id", "business_id"]
          },
          {
            foreignKeyName: "menu_item_tracked_good_fk"
            columns: ["tracked_inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "production_alert"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      notification: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          type: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
        ]
      }
      order: {
        Row: {
          business_id: string
          commission_cents: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          discount_cents: number
          discount_pct: number
          id: string
          order_no: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          business_id: string
          commission_cents?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_cents?: number
          discount_pct?: number
          id?: string
          order_no: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          commission_cents?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_cents?: number
          discount_pct?: number
          id?: string
          order_no?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_customer_id_business_id_fkey"
            columns: ["customer_id", "business_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      order_item: {
        Row: {
          business_id: string
          created_at: string
          id: string
          menu_item_id: string | null
          name_snapshot: string
          order_id: string
          qty: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          menu_item_id?: string | null
          name_snapshot: string
          order_id: string
          qty?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          menu_item_id?: string | null
          name_snapshot?: string
          order_id?: string
          qty?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_menu_item_id_business_id_fkey"
            columns: ["menu_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "menu_item"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "order_item_order_id_business_id_fkey"
            columns: ["order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "order"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      profile: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          language_pref: Database["public"]["Enums"]["app_language"]
          name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id: string
          language_pref?: Database["public"]["Enums"]["app_language"]
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          language_pref?: Database["public"]["Enums"]["app_language"]
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_line: {
        Row: {
          business_id: string
          created_at: string
          id: string
          inventory_item_id: string
          menu_item_id: string
          qty: number
          unit: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          inventory_item_id: string
          menu_item_id: string
          qty: number
          unit?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          inventory_item_id?: string
          menu_item_id?: string
          qty?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_line_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_line_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "inventory_item"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "recipe_line_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "recipe_line_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "merchandise_sale_price"
            referencedColumns: ["inventory_item_id", "business_id"]
          },
          {
            foreignKeyName: "recipe_line_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "production_alert"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "recipe_line_menu_item_id_business_id_fkey"
            columns: ["menu_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "menu_item"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      salary_payment: {
        Row: {
          approved_by: string | null
          base_cents: number
          bonus_cents: number
          business_id: string
          created_at: string
          employee_id: string
          expense_id: string | null
          id: string
          paid_at: string | null
          pay_date: string
          status: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          base_cents: number
          bonus_cents?: number
          business_id: string
          created_at?: string
          employee_id: string
          expense_id?: string | null
          id?: string
          paid_at?: string | null
          pay_date: string
          status?: string
          total_cents: number
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          base_cents?: number
          bonus_cents?: number
          business_id?: string
          created_at?: string
          employee_id?: string
          expense_id?: string | null
          id?: string
          paid_at?: string | null
          pay_date?: string
          status?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_payment_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payment_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payment_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employee"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payment_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expense"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_line: {
        Row: {
          business_id: string
          closing_qty: number | null
          created_at: string
          id: string
          inventory_item_id: string
          opening_qty: number
          received_qty: number
          stock_day_id: string
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          business_id: string
          closing_qty?: number | null
          created_at?: string
          id?: string
          inventory_item_id: string
          opening_qty?: number
          received_qty?: number
          stock_day_id: string
          unit_price_cents?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          closing_qty?: number | null
          created_at?: string
          id?: string
          inventory_item_id?: string
          opening_qty?: number
          received_qty?: number
          stock_day_id?: string
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_line_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_line_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "inventory_item"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "stock_count_line_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "stock_count_line_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "merchandise_sale_price"
            referencedColumns: ["inventory_item_id", "business_id"]
          },
          {
            foreignKeyName: "stock_count_line_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "production_alert"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "stock_count_line_stock_day_id_business_id_fkey"
            columns: ["stock_day_id", "business_id"]
            isOneToOne: false
            referencedRelation: "stock_day"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      stock_day: {
        Row: {
          business_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          date: string
          id: string
          opened_at: string
          opened_by: string | null
          status: Database["public"]["Enums"]["stock_day_status"]
          updated_at: string
        }
        Insert: {
          business_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          date: string
          id?: string
          opened_at?: string
          opened_by?: string | null
          status?: Database["public"]["Enums"]["stock_day_status"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          date?: string
          id?: string
          opened_at?: string
          opened_by?: string | null
          status?: Database["public"]["Enums"]["stock_day_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_day_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_day_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_day_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movement: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          delta: number
          id: string
          inventory_item_id: string
          note: string | null
          reason: Database["public"]["Enums"]["stock_movement_reason"]
          ref_order_id: string | null
          ref_stock_day_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          inventory_item_id: string
          note?: string | null
          reason: Database["public"]["Enums"]["stock_movement_reason"]
          ref_order_id?: string | null
          ref_stock_day_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          inventory_item_id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["stock_movement_reason"]
          ref_order_id?: string | null
          ref_stock_day_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "inventory_item"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "stock_movement_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "stock_movement_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "merchandise_sale_price"
            referencedColumns: ["inventory_item_id", "business_id"]
          },
          {
            foreignKeyName: "stock_movement_inventory_item_id_business_id_fkey"
            columns: ["inventory_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "production_alert"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "stock_movement_ref_order_id_business_id_fkey"
            columns: ["ref_order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "order"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "stock_movement_ref_stock_day_fk"
            columns: ["ref_stock_day_id", "business_id"]
            isOneToOne: false
            referencedRelation: "stock_day"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
    }
    Views: {
      inventory_low_stock: {
        Row: {
          business_id: string | null
          id: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
        ]
      }
      merchandise_sale_price: {
        Row: {
          business_id: string | null
          inventory_item_id: string | null
          price_cents: number | null
        }
        Insert: {
          business_id?: string | null
          inventory_item_id?: string | null
          price_cents?: never
        }
        Update: {
          business_id?: string | null
          inventory_item_id?: string | null
          price_cents?: never
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
        ]
      }
      production_alert: {
        Row: {
          business_id: string | null
          id: string | null
          low_stock_threshold: number | null
          name: string | null
          qty_on_hand: number | null
          unit: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string | null
          low_stock_threshold?: number | null
          name?: string | null
          qty_on_hand?: number | null
          unit?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string | null
          low_stock_threshold?: number | null
          name?: string | null
          qty_on_hand?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_cost_line: {
        Row: {
          business_id: string | null
          menu_item_id: string | null
          qty: number | null
          unit_cost_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_line_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_line_menu_item_id_business_id_fkey"
            columns: ["menu_item_id", "business_id"]
            isOneToOne: false
            referencedRelation: "menu_item"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
    }
    Functions: {
      approve_salary_payment: {
        Args: {
          p_bonus_cents?: number
          p_employee_id: string
          p_pay_date: string
        }
        Returns: string
      }
      close_stock_day: {
        Args: { p_lines: Json; p_stock_day_id: string }
        Returns: {
          business_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          date: string
          id: string
          opened_at: string
          opened_by: string | null
          status: Database["public"]["Enums"]["stock_day_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_day"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order: {
        Args: {
          p_customer_name: string
          p_discount_pct?: number
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_payment_status: Database["public"]["Enums"]["payment_status"]
          p_source: Database["public"]["Enums"]["order_source"]
        }
        Returns: {
          business_id: string
          commission_cents: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          discount_cents: number
          discount_pct: number
          id: string
          order_no: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "order"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_salary_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      list_linkable_accounts: {
        Args: never
        Returns: {
          email: string
          id: string
          linked_employee_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      open_stock_day: {
        Args: { p_date: string; p_lines: Json }
        Returns: {
          business_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          date: string
          id: string
          opened_at: string
          opened_by: string | null
          status: Database["public"]["Enums"]["stock_day_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_day"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      produce_batch: {
        Args: { p_inventory_item_id: string; p_note?: string; p_qty: number }
        Returns: {
          barcode: string | null
          business_id: string
          category: Database["public"]["Enums"]["inventory_category"]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["inventory_kind"]
          low_stock_threshold: number
          name: string
          qty_on_hand: number
          sale_price_cents: number | null
          sku: string | null
          unit: string
          unit_cost_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_item"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      receive_stock: {
        Args: { p_inventory_item_id: string; p_note?: string; p_qty: number }
        Returns: {
          barcode: string | null
          business_id: string
          category: Database["public"]["Enums"]["inventory_category"]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["inventory_kind"]
          low_stock_threshold: number
          name: string
          qty_on_hand: number
          sale_price_cents: number | null
          sku: string | null
          unit: string
          unit_cost_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_item"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      return_finished_good: {
        Args: { p_inventory_item_id: string; p_note?: string; p_qty: number }
        Returns: {
          barcode: string | null
          business_id: string
          category: Database["public"]["Enums"]["inventory_category"]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["inventory_kind"]
          low_stock_threshold: number
          name: string
          qty_on_hand: number
          sale_price_cents: number | null
          sku: string | null
          unit: string
          unit_cost_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_item"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_salary_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      set_account_role: {
        Args: {
          new_role: Database["public"]["Enums"]["app_role"]
          target_profile_id: string
        }
        Returns: undefined
      }
      set_order_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_order_id: string
        }
        Returns: {
          business_id: string
          commission_cents: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          discount_cents: number
          discount_pct: number
          id: string
          order_no: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "order"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_language: "en" | "si"
      app_role: "owner" | "manager" | "staff"
      booking_status: "pending" | "confirmed" | "completed" | "cancelled"
      booking_type: "reservation" | "custom_order"
      inventory_category:
        | "baking"
        | "beverages"
        | "syrups_toppings"
        | "merch"
        | "other"
      inventory_kind: "ingredient" | "merchandise" | "finished_good"
      order_source:
        | "dine_in"
        | "walk_in"
        | "whatsapp"
        | "online"
        | "pickme_food"
        | "uber_eats"
      order_status: "pending" | "completed" | "cancelled"
      payment_method: "cash" | "card" | "online" | "wallet"
      payment_status: "unpaid" | "paid" | "refunded"
      stock_day_status: "open" | "closed"
      stock_movement_reason:
        | "sale"
        | "sale_reversal"
        | "restock"
        | "count_adjust"
        | "manual"
        | "production"
        | "return"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_language: ["en", "si"],
      app_role: ["owner", "manager", "staff"],
      booking_status: ["pending", "confirmed", "completed", "cancelled"],
      booking_type: ["reservation", "custom_order"],
      inventory_category: [
        "baking",
        "beverages",
        "syrups_toppings",
        "merch",
        "other",
      ],
      inventory_kind: ["ingredient", "merchandise", "finished_good"],
      order_source: [
        "dine_in",
        "walk_in",
        "whatsapp",
        "online",
        "pickme_food",
        "uber_eats",
      ],
      order_status: ["pending", "completed", "cancelled"],
      payment_method: ["cash", "card", "online", "wallet"],
      payment_status: ["unpaid", "paid", "refunded"],
      stock_day_status: ["open", "closed"],
      stock_movement_reason: [
        "sale",
        "sale_reversal",
        "restock",
        "count_adjust",
        "manual",
        "production",
        "return",
      ],
    },
  },
} as const
