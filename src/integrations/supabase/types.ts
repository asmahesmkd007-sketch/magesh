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
  public: {
    Tables: {
      about_articles: {
        Row: {
          author_id: string | null
          category: string
          content: string
          created_at: string
          id: string
          is_published: boolean
          slug: string
          sort_order: number
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string
          content: string
          created_at?: string
          id?: string
          is_published?: boolean
          slug: string
          sort_order?: number
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          slug?: string
          sort_order?: number
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_details: {
        Row: {
          account_holder_name: string
          account_number_encrypted: string
          account_number_last4: string
          account_type: string
          bank_name: string
          branch_address: string | null
          branch_name: string | null
          created_at: string
          id: string
          ifsc_code: string
          updated_at: string
          user_id: string
          verification_status: string
        }
        Insert: {
          account_holder_name: string
          account_number_encrypted: string
          account_number_last4: string
          account_type: string
          bank_name: string
          branch_address?: string | null
          branch_name?: string | null
          created_at?: string
          id?: string
          ifsc_code: string
          updated_at?: string
          user_id: string
          verification_status?: string
        }
        Update: {
          account_holder_name?: string
          account_number_encrypted?: string
          account_number_last4?: string
          account_type?: string
          bank_name?: string
          branch_address?: string | null
          branch_name?: string | null
          created_at?: string
          id?: string
          ifsc_code?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_details_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channel_members: {
        Row: {
          banned: boolean
          channel_id: string
          joined_at: string
          last_read_at: string
          muted_until: string | null
          role: string
          user_id: string
        }
        Insert: {
          banned?: boolean
          channel_id: string
          joined_at?: string
          last_read_at?: string
          muted_until?: string | null
          role?: string
          user_id: string
        }
        Update: {
          banned?: boolean
          channel_id?: string
          joined_at?: string
          last_read_at?: string
          muted_until?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_private: boolean
          member_count: number
          name: string | null
          owner_id: string | null
          slug: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean
          member_count?: number
          name?: string | null
          owner_id?: string | null
          slug?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean
          member_count?: number
          name?: string | null
          owner_id?: string | null
          slug?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          is_deleted: boolean
          is_pinned: boolean
          reply_to_id: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          reply_to_id?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          reply_to_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          message_id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          message_id: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clan_join_requests: {
        Row: {
          clan_id: string
          created_at: string | null
          id: string
          sender_type: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clan_id: string
          created_at?: string | null
          id?: string
          sender_type?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clan_id?: string
          created_at?: string | null
          id?: string
          sender_type?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clan_join_requests_clan_id_fkey"
            columns: ["clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clan_members: {
        Row: {
          clan_id: string
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
          war_points: number | null
        }
        Insert: {
          clan_id: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
          war_points?: number | null
        }
        Update: {
          clan_id?: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
          war_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clan_members_clan_id_fkey"
            columns: ["clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clan_war_matches: {
        Row: {
          created_at: string | null
          end_time: string | null
          id: string
          match_id: string | null
          move_count: number | null
          p1_points: number | null
          p2_points: number | null
          player1_id: string | null
          player2_id: string | null
          result: string | null
          slot_index: number
          start_time: string | null
          status: string | null
          war_id: string
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          match_id?: string | null
          move_count?: number | null
          p1_points?: number | null
          p2_points?: number | null
          player1_id?: string | null
          player2_id?: string | null
          result?: string | null
          slot_index: number
          start_time?: string | null
          status?: string | null
          war_id: string
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          match_id?: string | null
          move_count?: number | null
          p1_points?: number | null
          p2_points?: number | null
          player1_id?: string | null
          player2_id?: string | null
          result?: string | null
          slot_index?: number
          start_time?: string | null
          status?: string | null
          war_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clan_war_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_war_matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_war_matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_war_matches_war_id_fkey"
            columns: ["war_id"]
            isOneToOne: false
            referencedRelation: "clan_wars"
            referencedColumns: ["id"]
          },
        ]
      }
      clan_wars: {
        Row: {
          clan_a_id: string
          clan_b_id: string
          created_at: string | null
          end_time: string
          id: string
          lineup_a: string[] | null
          lineup_b: string[] | null
          score_a: number | null
          score_b: number | null
          start_time: string
          status: string | null
          winner_clan_id: string | null
        }
        Insert: {
          clan_a_id: string
          clan_b_id: string
          created_at?: string | null
          end_time: string
          id?: string
          lineup_a?: string[] | null
          lineup_b?: string[] | null
          score_a?: number | null
          score_b?: number | null
          start_time: string
          status?: string | null
          winner_clan_id?: string | null
        }
        Update: {
          clan_a_id?: string
          clan_b_id?: string
          created_at?: string | null
          end_time?: string
          id?: string
          lineup_a?: string[] | null
          lineup_b?: string[] | null
          score_a?: number | null
          score_b?: number | null
          start_time?: string
          status?: string | null
          winner_clan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clan_wars_clan_a_id_fkey"
            columns: ["clan_a_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_wars_clan_b_id_fkey"
            columns: ["clan_b_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_wars_winner_clan_id_fkey"
            columns: ["winner_clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
        ]
      }
      clans: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          leader_id: string
          name: string
          tag: string
          total_members: number | null
          total_wars: number | null
          updated_at: string | null
          war_points: number | null
          war_wins: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          leader_id: string
          name: string
          tag: string
          total_members?: number | null
          total_wars?: number | null
          updated_at?: string | null
          war_points?: number | null
          war_wins?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          leader_id?: string
          name?: string
          tag?: string
          total_members?: number | null
          total_wars?: number | null
          updated_at?: string | null
          war_points?: number | null
          war_wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clans_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["club_role"]
          user_id: string
        }
        Insert: {
          club_id: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          user_id: string
        }
        Update: {
          club_id?: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          banner_url: string | null
          cover_gradient: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean
          member_count: number
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          cover_gradient?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          member_count?: number
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          cover_gradient?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          member_count?: number
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_achievements: {
        Row: {
          awarded_at: string
          code: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          code: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_blocks: {
        Row: {
          blocked_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          blocked_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          blocked_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_bookmarks: {
        Row: {
          collection: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          collection?: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          collection?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          content: string
          created_at: string
          dislikes_count: number
          fen: string | null
          id: string
          is_hidden: boolean
          likes_count: number
          parent_id: string | null
          pgn: string | null
          post_id: string
          replies_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          dislikes_count?: number
          fen?: string | null
          id?: string
          is_hidden?: boolean
          likes_count?: number
          parent_id?: string | null
          pgn?: string | null
          post_id: string
          replies_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          dislikes_count?: number
          fen?: string | null
          id?: string
          is_hidden?: boolean
          likes_count?: number
          parent_id?: string | null
          pgn?: string | null
          post_id?: string
          replies_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_hidden_posts: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_hidden_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_hidden_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_mutes: {
        Row: {
          created_at: string
          muted_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          muted_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          muted_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_mutes_muted_id_fkey"
            columns: ["muted_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_votes: {
        Row: {
          created_at: string
          option_idx: number
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_idx: number
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_idx?: number
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          bookmarks_count: number
          comments_count: number
          content: string
          created_at: string
          dislikes_count: number
          fen: string | null
          id: string
          is_featured: boolean
          is_hidden: boolean
          is_pinned: boolean
          likes_count: number
          link_url: string | null
          media_url: string | null
          pgn: string | null
          poll_ends_at: string | null
          poll_options: string[] | null
          post_type: string
          puzzle_solution: string | null
          score: number
          shares_count: number
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          bookmarks_count?: number
          comments_count?: number
          content?: string
          created_at?: string
          dislikes_count?: number
          fen?: string | null
          id?: string
          is_featured?: boolean
          is_hidden?: boolean
          is_pinned?: boolean
          likes_count?: number
          link_url?: string | null
          media_url?: string | null
          pgn?: string | null
          poll_ends_at?: string | null
          poll_options?: string[] | null
          post_type?: string
          puzzle_solution?: string | null
          score?: number
          shares_count?: number
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          bookmarks_count?: number
          comments_count?: number
          content?: string
          created_at?: string
          dislikes_count?: number
          fen?: string | null
          id?: string
          is_featured?: boolean
          is_hidden?: boolean
          is_pinned?: boolean
          likes_count?: number
          link_url?: string | null
          media_url?: string | null
          pgn?: string | null
          poll_ends_at?: string | null
          poll_options?: string[] | null
          post_type?: string
          puzzle_solution?: string | null
          score?: number
          shares_count?: number
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reactions: {
        Row: {
          created_at: string
          id: string
          reaction: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks: {
        Row: {
          created_at: string | null
          id: string
          message: string
          rating: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          rating?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string | null
          id: string
          receiver_id: string
          sender_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          receiver_id: string
          sender_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friends: {
        Row: {
          addressee_id: string | null
          created_at: string | null
          id: string
          requester_id: string | null
          status: Database["public"]["Enums"]["friend_status"]
          updated_at: string
          user1_id: string | null
          user2_id: string | null
        }
        Insert: {
          addressee_id?: string | null
          created_at?: string | null
          id?: string
          requester_id?: string | null
          status?: Database["public"]["Enums"]["friend_status"]
          updated_at?: string
          user1_id?: string | null
          user2_id?: string | null
        }
        Update: {
          addressee_id?: string | null
          created_at?: string | null
          id?: string
          requester_id?: string | null
          status?: Database["public"]["Enums"]["friend_status"]
          updated_at?: string
          user1_id?: string | null
          user2_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friends_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_analysis: {
        Row: {
          accuracy_black: number | null
          accuracy_white: number | null
          acpl_black: number | null
          acpl_white: number | null
          analysis_status: string
          analyzed_at: string | null
          blunders_black: number
          blunders_white: number
          class_counts_black: Json
          class_counts_white: Json
          created_at: string
          game_id: string
          id: string
          mistakes_black: number
          mistakes_white: number
          opening_eco: string | null
          opening_name: string | null
        }
        Insert: {
          accuracy_black?: number | null
          accuracy_white?: number | null
          acpl_black?: number | null
          acpl_white?: number | null
          analysis_status?: string
          analyzed_at?: string | null
          blunders_black?: number
          blunders_white?: number
          class_counts_black?: Json
          class_counts_white?: Json
          created_at?: string
          game_id: string
          id?: string
          mistakes_black?: number
          mistakes_white?: number
          opening_eco?: string | null
          opening_name?: string | null
        }
        Update: {
          accuracy_black?: number | null
          accuracy_white?: number | null
          acpl_black?: number | null
          acpl_white?: number | null
          analysis_status?: string
          analyzed_at?: string | null
          blunders_black?: number
          blunders_white?: number
          class_counts_black?: Json
          class_counts_white?: Json
          created_at?: string
          game_id?: string
          id?: string
          mistakes_black?: number
          mistakes_white?: number
          opening_eco?: string | null
          opening_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_analysis_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_challenges: {
        Row: {
          created_at: string | null
          from_user_id: string
          id: string
          status: string | null
          timer: number
          to_user_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          from_user_id: string
          id?: string
          status?: string | null
          timer: number
          to_user_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          from_user_id?: string
          id?: string
          status?: string | null
          timer?: number
          to_user_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_challenges_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_challenges_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_chat: {
        Row: {
          body: string
          created_at: string
          game_id: string
          id: number
          user_id: string
          username: string
        }
        Insert: {
          body: string
          created_at?: string
          game_id: string
          id?: number
          user_id: string
          username: string
        }
        Update: {
          body?: string
          created_at?: string
          game_id?: string
          id?: number
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_chat_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_moves: {
        Row: {
          best_move_san: string | null
          by_user: string | null
          classification: string | null
          created_at: string
          eval_after_cp: number | null
          eval_before_cp: number | null
          fen_after: string
          fen_before: string | null
          game_id: string
          id: number
          is_capture: boolean
          is_castling: boolean
          is_check: boolean
          is_promotion: boolean
          ply: number
          san: string
          time_left_ms: number | null
          time_used_ms: number | null
          uci: string
        }
        Insert: {
          best_move_san?: string | null
          by_user?: string | null
          classification?: string | null
          created_at?: string
          eval_after_cp?: number | null
          eval_before_cp?: number | null
          fen_after: string
          fen_before?: string | null
          game_id: string
          id?: number
          is_capture?: boolean
          is_castling?: boolean
          is_check?: boolean
          is_promotion?: boolean
          ply: number
          san: string
          time_left_ms?: number | null
          time_used_ms?: number | null
          uci: string
        }
        Update: {
          best_move_san?: string | null
          by_user?: string | null
          classification?: string | null
          created_at?: string
          eval_after_cp?: number | null
          eval_before_cp?: number | null
          fen_after?: string
          fen_before?: string | null
          game_id?: string
          id?: number
          is_capture?: boolean
          is_castling?: boolean
          is_check?: boolean
          is_promotion?: boolean
          ply?: number
          san?: string
          time_left_ms?: number | null
          time_used_ms?: number | null
          uci?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          black_id: string | null
          black_rating: number | null
          black_time_ms: number
          black_username: string | null
          created_at: string
          draw_offered_by: string | null
          elo_applied: boolean
          end_reason: string | null
          ended_at: string | null
          fen: string
          host_id: string | null
          id: string
          increment_seconds: number
          initial_seconds: number
          is_rated: boolean
          last_move_at: string | null
          moves_count: number
          opening: string | null
          pgn: string
          result: Database["public"]["Enums"]["game_result"]
          status: string
          time_class: Database["public"]["Enums"]["time_class"]
          time_control: string
          tournament_id: string | null
          tournament_match_id: string | null
          turn: string
          vs_computer: boolean
          white_id: string | null
          white_rating: number | null
          white_time_ms: number
          white_username: string | null
          winner_id: string | null
        }
        Insert: {
          black_id?: string | null
          black_rating?: number | null
          black_time_ms?: number
          black_username?: string | null
          created_at?: string
          draw_offered_by?: string | null
          elo_applied?: boolean
          end_reason?: string | null
          ended_at?: string | null
          fen?: string
          host_id?: string | null
          id?: string
          increment_seconds?: number
          initial_seconds?: number
          is_rated?: boolean
          last_move_at?: string | null
          moves_count?: number
          opening?: string | null
          pgn?: string
          result?: Database["public"]["Enums"]["game_result"]
          status?: string
          time_class?: Database["public"]["Enums"]["time_class"]
          time_control?: string
          tournament_id?: string | null
          tournament_match_id?: string | null
          turn?: string
          vs_computer?: boolean
          white_id?: string | null
          white_rating?: number | null
          white_time_ms?: number
          white_username?: string | null
          winner_id?: string | null
        }
        Update: {
          black_id?: string | null
          black_rating?: number | null
          black_time_ms?: number
          black_username?: string | null
          created_at?: string
          draw_offered_by?: string | null
          elo_applied?: boolean
          end_reason?: string | null
          ended_at?: string | null
          fen?: string
          host_id?: string | null
          id?: string
          increment_seconds?: number
          initial_seconds?: number
          is_rated?: boolean
          last_move_at?: string | null
          moves_count?: number
          opening?: string | null
          pgn?: string
          result?: Database["public"]["Enums"]["game_result"]
          status?: string
          time_class?: Database["public"]["Enums"]["time_class"]
          time_control?: string
          tournament_id?: string | null
          tournament_match_id?: string | null
          turn?: string
          vs_computer?: boolean
          white_id?: string | null
          white_rating?: number | null
          white_time_ms?: number
          white_username?: string | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_tournament_match_id_fkey"
            columns: ["tournament_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_requests: {
        Row: {
          aadhaar_number: string | null
          address_line1: string | null
          address_line2: string | null
          address_line3: string | null
          back_image_url: string | null
          created_at: string | null
          dob: string
          document_type: string
          front_image_url: string | null
          full_image_url: string | null
          id: string
          name: string
          nationality: string | null
          pan_image_url: string | null
          pan_number: string | null
          passport_number: string | null
          pincode: string | null
          rejection_reason: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aadhaar_number?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          back_image_url?: string | null
          created_at?: string | null
          dob: string
          document_type: string
          front_image_url?: string | null
          full_image_url?: string | null
          id?: string
          name: string
          nationality?: string | null
          pan_image_url?: string | null
          pan_number?: string | null
          passport_number?: string | null
          pincode?: string | null
          rejection_reason?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aadhaar_number?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          back_image_url?: string | null
          created_at?: string | null
          dob?: string
          document_type?: string
          front_image_url?: string | null
          full_image_url?: string | null
          id?: string
          name?: string
          nationality?: string | null
          pan_image_url?: string | null
          pan_number?: string | null
          passport_number?: string | null
          pincode?: string | null
          rejection_reason?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          bot_difficulty: number | null
          bracket_index: number | null
          created_at: string | null
          end_time: string | null
          fen: string | null
          game_id: string | null
          id: string
          iq_change_p1: number | null
          iq_change_p2: number | null
          match_type: string
          moves: Json | null
          no_show_player_id: string | null
          player1_id: string | null
          player2_id: string | null
          result: string | null
          room_id: string | null
          round: number | null
          start_time: string | null
          status: string | null
          timer_type: number | null
          tournament_id: string | null
          winner_id: string | null
        }
        Insert: {
          bot_difficulty?: number | null
          bracket_index?: number | null
          created_at?: string | null
          end_time?: string | null
          fen?: string | null
          game_id?: string | null
          id?: string
          iq_change_p1?: number | null
          iq_change_p2?: number | null
          match_type: string
          moves?: Json | null
          no_show_player_id?: string | null
          player1_id?: string | null
          player2_id?: string | null
          result?: string | null
          room_id?: string | null
          round?: number | null
          start_time?: string | null
          status?: string | null
          timer_type?: number | null
          tournament_id?: string | null
          winner_id?: string | null
        }
        Update: {
          bot_difficulty?: number | null
          bracket_index?: number | null
          created_at?: string | null
          end_time?: string | null
          fen?: string | null
          game_id?: string | null
          id?: string
          iq_change_p1?: number | null
          iq_change_p2?: number | null
          match_type?: string
          moves?: Json | null
          no_show_player_id?: string | null
          player1_id?: string | null
          player2_id?: string | null
          result?: string | null
          room_id?: string | null
          round?: number | null
          start_time?: string | null
          status?: string | null
          timer_type?: number | null
          tournament_id?: string | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matchmaking_pool: {
        Row: {
          id: string
          increment_seconds: number
          initial_seconds: number
          joined_at: string
          rating: number
          time_class: string
          time_control: string
          user_id: string
          username: string
        }
        Insert: {
          id?: string
          increment_seconds?: number
          initial_seconds?: number
          joined_at?: string
          rating?: number
          time_class?: string
          time_control?: string
          user_id: string
          username: string
        }
        Update: {
          id?: string
          increment_seconds?: number
          initial_seconds?: number
          joined_at?: string
          rating?: number
          time_class?: string
          time_control?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      membership_history: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          tier: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          tier?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          tier?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_transactions: {
        Row: {
          amount: number
          coins_rewarded: number | null
          created_at: string | null
          id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: string
          tier: string
          user_id: string
        }
        Insert: {
          amount: number
          coins_rewarded?: number | null
          created_at?: string | null
          id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string
          tier: string
          user_id: string
        }
        Update: {
          amount?: number
          coins_rewarded?: number | null
          created_at?: string | null
          id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string | null
          expiry_date: string | null
          id: string
          start_date: string | null
          status: string
          tier: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          start_date?: string | null
          status?: string
          tier: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          start_date?: string | null
          status?: string
          tier?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          category: string | null
          cover_gradient: string | null
          cover_image: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_featured: boolean
          published: boolean
          published_at: string | null
          read_time_min: number | null
          slug: string
          title: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          category?: string | null
          cover_gradient?: string | null
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean
          published?: boolean
          published_at?: string | null
          read_time_min?: number | null
          slug: string
          title: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          category?: string | null
          cover_gradient?: string | null
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean
          published?: boolean
          published_at?: string | null
          read_time_min?: number | null
          slug?: string
          title?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          kind: string | null
          link: string | null
          message: string
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          kind?: string | null
          link?: string | null
          message: string
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          kind?: string | null
          link?: string | null
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_friends: {
        Row: {
          created_at: string | null
          friend_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          friend_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          friend_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinned_friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          is_published: boolean
          policy_type: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_published?: boolean
          policy_type: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          policy_type?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      policy_versions: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          policy_id: string
          title: string
          version: number
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          policy_id: string
          title: string
          version: number
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          policy_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_versions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_failures: {
        Row: {
          amount: number | null
          created_at: string | null
          error_message: string | null
          id: string
          rank: number | null
          tournament_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          rank?: number | null
          tournament_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          rank?: number | null
          tournament_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prize_failures_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_failures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          best_streak: number | null
          bio: string | null
          community_score: number
          country: string | null
          country_code: string | null
          country_name: string | null
          created_at: string | null
          current_streak: number | null
          full_name: string
          draws: number | null
          facebook_url: string | null
          followers_count: number
          following_count: number
          full_name: string
          id: string
          instagram_url: string | null
          iq_level: number | null
          is_admin: boolean | null
          is_member: boolean | null
          is_online: boolean | null
          kyc_rejection_reason: string | null
          kyc_status: string | null
          kyc_verified: boolean | null
          last_seen: string | null
          losses: number | null
          membership_badge: string | null
          membership_expiry_date: string | null
          membership_last_purchase: string | null
          membership_purchase_count: number | null
          membership_start_date: string | null
          membership_status: string | null
          membership_tier: string | null
          payout_details: Json | null
          phone: string | null
          player_id: string | null
          posts_count: number
          premium_active: boolean
          premium_expires_at: string | null
          premium_tier: string
          profile_image: string | null
          rank: string | null
          region: string | null
          settings: Json | null
          status: string | null
          subscription_status: string
          theme_preference: string | null
          title: string | null
          total_matches: number | null
          trophy_bronze: number | null
          trophy_gold: number | null
          trophy_silver: number | null
          twitter_url: string | null
          updated_at: string | null
          username: string
          website: string | null
          win_rate: number | null
          wins: number | null
          youtube_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          best_streak?: number | null
          bio?: string | null
          community_score?: number
          country?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string | null
          current_streak?: number | null
          full_name?: string
          draws?: number | null
          facebook_url?: string | null
          followers_count?: number
          following_count?: number
          full_name?: string
          id: string
          instagram_url?: string | null
          iq_level?: number | null
          is_admin?: boolean | null
          is_member?: boolean | null
          is_online?: boolean | null
          kyc_rejection_reason?: string | null
          kyc_status?: string | null
          kyc_verified?: boolean | null
          last_seen?: string | null
          losses?: number | null
          membership_badge?: string | null
          membership_expiry_date?: string | null
          membership_last_purchase?: string | null
          membership_purchase_count?: number | null
          membership_start_date?: string | null
          membership_status?: string | null
          membership_tier?: string | null
          payout_details?: Json | null
          phone?: string | null
          player_id?: string | null
          posts_count?: number
          premium_active?: boolean
          premium_expires_at?: string | null
          premium_tier?: string
          profile_image?: string | null
          rank?: string | null
          region?: string | null
          settings?: Json | null
          status?: string | null
          subscription_status?: string
          theme_preference?: string | null
          title?: string | null
          total_matches?: number | null
          trophy_bronze?: number | null
          trophy_gold?: number | null
          trophy_silver?: number | null
          twitter_url?: string | null
          updated_at?: string | null
          username: string
          website?: string | null
          win_rate?: number | null
          wins?: number | null
          youtube_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          best_streak?: number | null
          bio?: string | null
          community_score?: number
          country?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string | null
          current_streak?: number | null
          full_name?: string
          draws?: number | null
          facebook_url?: string | null
          followers_count?: number
          following_count?: number
          full_name?: string
          id?: string
          instagram_url?: string | null
          iq_level?: number | null
          is_admin?: boolean | null
          is_member?: boolean | null
          is_online?: boolean | null
          kyc_rejection_reason?: string | null
          kyc_status?: string | null
          kyc_verified?: boolean | null
          last_seen?: string | null
          losses?: number | null
          membership_badge?: string | null
          membership_expiry_date?: string | null
          membership_last_purchase?: string | null
          membership_purchase_count?: number | null
          membership_start_date?: string | null
          membership_status?: string | null
          membership_tier?: string | null
          payout_details?: Json | null
          phone?: string | null
          player_id?: string | null
          posts_count?: number
          premium_active?: boolean
          premium_expires_at?: string | null
          premium_tier?: string
          profile_image?: string | null
          rank?: string | null
          region?: string | null
          settings?: Json | null
          status?: string | null
          subscription_status?: string
          theme_preference?: string | null
          title?: string | null
          total_matches?: number | null
          trophy_bronze?: number | null
          trophy_gold?: number | null
          trophy_silver?: number | null
          twitter_url?: string | null
          updated_at?: string | null
          username?: string
          website?: string | null
          win_rate?: number | null
          wins?: number | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      public_room_players: {
        Row: {
          device_id: string | null
          id: string
          joined_at: string | null
          last_seen: string | null
          queue_pos: number | null
          room_id: string
          socket_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          device_id?: string | null
          id?: string
          joined_at?: string | null
          last_seen?: string | null
          queue_pos?: number | null
          room_id: string
          socket_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          device_id?: string | null
          id?: string
          joined_at?: string | null
          last_seen?: string | null
          queue_pos?: number | null
          room_id?: string
          socket_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "public_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_room_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_rooms: {
        Row: {
          created_at: string | null
          current_players: number | null
          expires_at: string | null
          host_id: string
          id: string
          is_private: boolean | null
          last_activity_at: string | null
          max_players: number | null
          password_hash: string | null
          region: string | null
          room_code: string
          server_node: string | null
          spectator_count: number | null
          status: string | null
          timer_type: number
        }
        Insert: {
          created_at?: string | null
          current_players?: number | null
          expires_at?: string | null
          host_id: string
          id?: string
          is_private?: boolean | null
          last_activity_at?: string | null
          max_players?: number | null
          password_hash?: string | null
          region?: string | null
          room_code: string
          server_node?: string | null
          spectator_count?: number | null
          status?: string | null
          timer_type: number
        }
        Update: {
          created_at?: string | null
          current_players?: number | null
          expires_at?: string | null
          host_id?: string
          id?: string
          is_private?: boolean | null
          last_activity_at?: string | null
          max_players?: number | null
          password_hash?: string | null
          region?: string | null
          room_code?: string
          server_node?: string | null
          spectator_count?: number | null
          status?: string | null
          timer_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      puzzle_attempts: {
        Row: {
          attempted_at: string
          id: string
          puzzle_id: string
          puzzle_rating: number | null
          rating_change: number
          solved: boolean
          time_ms: number
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          puzzle_id: string
          puzzle_rating?: number | null
          rating_change?: number
          solved: boolean
          time_ms?: number
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          puzzle_id?: string
          puzzle_rating?: number | null
          rating_change?: number
          solved?: boolean
          time_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_attempts_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      puzzles: {
        Row: {
          category: string
          created_at: string
          difficulty: string
          explanation: string
          fen: string
          goal: string
          id: string
          moves: string
          popularity: number
          rating: number
          slug: string | null
          theme: string
          themes: string[]
        }
        Insert: {
          category?: string
          created_at?: string
          difficulty?: string
          explanation?: string
          fen: string
          goal?: string
          id?: string
          moves: string
          popularity?: number
          rating?: number
          slug?: string | null
          theme?: string
          themes?: string[]
        }
        Update: {
          category?: string
          created_at?: string
          difficulty?: string
          explanation?: string
          fen?: string
          goal?: string
          id?: string
          moves?: string
          popularity?: number
          rating?: number
          slug?: string | null
          theme?: string
          themes?: string[]
        }
        Relationships: []
      }
      rating_history: {
        Row: {
          created_at: string
          delta: number
          game_id: string | null
          id: number
          new_rating: number
          old_rating: number
          time_class: Database["public"]["Enums"]["time_class"]
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          game_id?: string | null
          id?: number
          new_rating: number
          old_rating: number
          time_class: Database["public"]["Enums"]["time_class"]
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          game_id?: string | null
          id?: number
          new_rating?: number
          old_rating?: number
          time_class?: Database["public"]["Enums"]["time_class"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_history_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          draws: number
          games_played: number
          id: string
          losses: number
          peak_rating: number
          rating: number
          time_class: Database["public"]["Enums"]["time_class"]
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          draws?: number
          games_played?: number
          id?: string
          losses?: number
          peak_rating?: number
          rating?: number
          time_class: Database["public"]["Enums"]["time_class"]
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          draws?: number
          games_played?: number
          id?: string
          losses?: number
          peak_rating?: number
          rating?: number
          time_class?: Database["public"]["Enums"]["time_class"]
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string | null
          description: string
          id: string
          issue_type: string | null
          priority: string | null
          reason: string | null
          reported_user: string | null
          reporter_id: string
          screenshot_url: string | null
          status: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          issue_type?: string | null
          priority?: string | null
          reason?: string | null
          reported_user?: string | null
          reporter_id: string
          screenshot_url?: string | null
          status?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          issue_type?: string | null
          priority?: string | null
          reason?: string | null
          reported_user?: string | null
          reporter_id?: string
          screenshot_url?: string | null
          status?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          created_at: string
          event: string
          id: string
          reason: string | null
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          reason?: string | null
          success: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          reason?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          coins_granted: number | null
          created_at: string | null
          expiry_date: string
          id: string
          payment_id: string | null
          plan_name: string
          purchase_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          coins_granted?: number | null
          created_at?: string | null
          expiry_date: string
          id?: string
          payment_id?: string | null
          plan_name: string
          purchase_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          coins_granted?: number | null
          created_at?: string | null
          expiry_date?: string
          id?: string
          payment_id?: string | null
          plan_name?: string
          purchase_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string | null
          email: string
          id: string
          issue_type: string | null
          message: string
          priority: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          issue_type?: string | null
          message: string
          priority?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          issue_type?: string | null
          message?: string
          priority?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_players: {
        Row: {
          draws: number | null
          final_rank: number | null
          id: string
          joined_at: string | null
          losses: number | null
          matches_played: number | null
          material_score: number
          max_round: number | null
          rank: number | null
          score: number | null
          status: string
          time_used_ms: number
          tournament_id: string
          user_id: string
          wins: number | null
        }
        Insert: {
          draws?: number | null
          final_rank?: number | null
          id?: string
          joined_at?: string | null
          losses?: number | null
          matches_played?: number | null
          material_score?: number
          max_round?: number | null
          rank?: number | null
          score?: number | null
          status?: string
          time_used_ms?: number
          tournament_id: string
          user_id: string
          wins?: number | null
        }
        Update: {
          draws?: number | null
          final_rank?: number | null
          id?: string
          joined_at?: string | null
          losses?: number | null
          matches_played?: number | null
          material_score?: number
          max_round?: number | null
          rank?: number | null
          score?: number | null
          status?: string
          time_used_ms?: number
          tournament_id?: string
          user_id?: string
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_rounds: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          round_number: number
          started_at: string | null
          status: string
          tournament_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          round_number: number
          started_at?: string | null
          status?: string
          tournament_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          round_number?: number
          started_at?: string | null
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_rounds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          category_key: string | null
          completed_at: string | null
          cover_gradient: string | null
          created_at: string | null
          created_by: string | null
          current_players: number | null
          current_round: number
          description: string | null
          end_time: string | null
          entry_fee: number | null
          format: string | null
          id: string
          locked_at: string | null
          max_players: number | null
          name: string
          phase: string | null
          prize_first: number | null
          prize_fourth: number
          prize_pool: number | null
          prize_second: number | null
          prize_third: number | null
          prizes_distributed: boolean
          slug: string | null
          start_time: string | null
          started_at: string | null
          status: string | null
          time_control: string | null
          timer_type: number
          total_rounds: number
          tr_id: string | null
          type: string
          updated_at: string | null
          winner_display: string | null
        }
        Insert: {
          category_key?: string | null
          completed_at?: string | null
          cover_gradient?: string | null
          created_at?: string | null
          created_by?: string | null
          current_players?: number | null
          current_round?: number
          description?: string | null
          end_time?: string | null
          entry_fee?: number | null
          format?: string | null
          id?: string
          locked_at?: string | null
          max_players?: number | null
          name: string
          phase?: string | null
          prize_first?: number | null
          prize_fourth?: number
          prize_pool?: number | null
          prize_second?: number | null
          prize_third?: number | null
          prizes_distributed?: boolean
          slug?: string | null
          start_time?: string | null
          started_at?: string | null
          status?: string | null
          time_control?: string | null
          timer_type: number
          total_rounds?: number
          tr_id?: string | null
          type: string
          updated_at?: string | null
          winner_display?: string | null
        }
        Update: {
          category_key?: string | null
          completed_at?: string | null
          cover_gradient?: string | null
          created_at?: string | null
          created_by?: string | null
          current_players?: number | null
          current_round?: number
          description?: string | null
          end_time?: string | null
          entry_fee?: number | null
          format?: string | null
          id?: string
          locked_at?: string | null
          max_players?: number | null
          name?: string
          phase?: string | null
          prize_first?: number | null
          prize_fourth?: number
          prize_pool?: number | null
          prize_second?: number | null
          prize_third?: number | null
          prizes_distributed?: boolean
          slug?: string | null
          start_time?: string | null
          started_at?: string | null
          status?: string | null
          time_control?: string | null
          timer_type?: number
          total_rounds?: number
          tr_id?: string | null
          type?: string
          updated_at?: string | null
          winner_display?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string | null
          description: string | null
          id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          reference_id: string | null
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          reference_id?: string | null
          status?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          reference_id?: string | null
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      user_streaks: {
        Row: {
          best_login_streak: number
          best_match_streak: number
          current_login_streak: number
          current_match_streak: number
          last_login_date: string | null
          last_match_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          best_login_streak?: number
          best_match_streak?: number
          current_login_streak?: number
          current_match_streak?: number
          last_login_date?: string | null
          last_match_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          best_login_streak?: number
          best_match_streak?: number
          current_login_streak?: number
          current_match_streak?: number
          last_login_date?: string | null
          last_match_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          id: string
          idempotency_key: string | null
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description: string
          id?: string
          idempotency_key?: string | null
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string
          id?: string
          idempotency_key?: string | null
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number | null
          created_at: string | null
          id: string
          locked_balance: number | null
          total_deposit: number | null
          total_deposited: number | null
          total_earned: number
          total_spent: number | null
          total_withdraw: number | null
          total_withdrawn: number | null
          total_won: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          id?: string
          locked_balance?: number | null
          total_deposit?: number | null
          total_deposited?: number | null
          total_earned?: number
          total_spent?: number | null
          total_withdraw?: number | null
          total_withdrawn?: number | null
          total_won?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          id?: string
          locked_balance?: number | null
          total_deposit?: number | null
          total_deposited?: number | null
          total_earned?: number
          total_spent?: number | null
          total_withdraw?: number | null
          total_withdrawn?: number | null
          total_won?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdraw_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string | null
          gst_amount: number | null
          id: string
          net_amount: number | null
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          status: string | null
          upi_id: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string | null
          gst_amount?: number | null
          id?: string
          net_amount?: number | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          status?: string | null
          upi_id?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string | null
          gst_amount?: number | null
          id?: string
          net_amount?: number | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          status?: string | null
          upi_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdraw_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdraw_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard: {
        Row: {
          draws: number | null
          id: string | null
          joined_at: string | null
          losses: number | null
          matches_played: number | null
          max_round: number | null
          rank: number | null
          score: number | null
          tournament_id: string | null
          user_id: string | null
          wins: number | null
        }
        Insert: {
          draws?: number | null
          id?: string | null
          joined_at?: string | null
          losses?: number | null
          matches_played?: number | null
          max_round?: number | null
          rank?: number | null
          score?: number | null
          tournament_id?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Update: {
          draws?: number | null
          id?: string | null
          joined_at?: string | null
          losses?: number | null
          matches_played?: number | null
          max_round?: number | null
          rank?: number | null
          score?: number | null
          tournament_id?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _tournament_distribute_prizes: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      _tournament_start_round: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      admin_chat_stats: { Args: never; Returns: Json }
      admin_community_stats: { Args: never; Returns: Json }
      admin_delete_post: { Args: { p_post_id: string }; Returns: undefined }
      admin_moderate_post: {
        Args: { p_hidden?: boolean; p_pinned?: boolean; p_post_id: string }
        Returns: undefined
      }
      admin_resolve_chat_report: {
        Args: { p_report_id: string; p_status: string }
        Returns: undefined
      }
      admin_resolve_report: {
        Args: { p_report_id: string; p_status: string }
        Returns: undefined
      }
      apply_elo_change: { Args: { p_game_id: string }; Returns: undefined }
      cancel_tournament_atomic: {
        Args: { p_admin_id: string; p_tournament_id: string }
        Returns: Json
      }
      chat_can_access: {
        Args: { p_channel: string; p_user: string }
        Returns: boolean
      }
      chat_channel_feed: {
        Args: { p_before?: string; p_channel: string; p_limit?: number }
        Returns: Json[]
      }
      chat_channel_json: {
        Args: {
          c: Database["public"]["Tables"]["chat_channels"]["Row"]
          p_viewer: string
        }
        Returns: Json
      }
      chat_channel_members: { Args: { p_channel: string }; Returns: Json[] }
      chat_cleanup_expired_global: { Args: never; Returns: undefined }
      chat_create_room: {
        Args: { p_description: string; p_is_private: boolean; p_name: string }
        Returns: Json
      }
      chat_delete_message: { Args: { p_message: string }; Returns: undefined }
      chat_delete_room: { Args: { p_channel: string }; Returns: undefined }
      chat_discover_rooms: {
        Args: { p_limit?: number; p_search?: string }
        Returns: Json[]
      }
      chat_get_channel: { Args: { p_slug_or_id: string }; Returns: Json }
      chat_get_or_create_dm: { Args: { p_other: string }; Returns: Json }
      chat_invite_user: {
        Args: { p_channel: string; p_username: string }
        Returns: undefined
      }
      chat_is_staff: {
        Args: { p_channel: string; p_user: string }
        Returns: boolean
      }
      chat_join_room: { Args: { p_channel: string }; Returns: undefined }
      chat_leave_room: { Args: { p_channel: string }; Returns: undefined }
      chat_mark_read: { Args: { p_channel: string }; Returns: undefined }
      chat_mute_member: {
        Args: { p_channel: string; p_minutes: number; p_user: string }
        Returns: undefined
      }
      chat_my_channels: { Args: never; Returns: Json[] }
      chat_notify: {
        Args: {
          p_body: string
          p_kind: string
          p_link: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      chat_pin_message: {
        Args: { p_message: string; p_pinned: boolean }
        Returns: undefined
      }
      chat_pinned_messages: { Args: { p_channel: string }; Returns: Json[] }
      chat_react: {
        Args: { p_emoji: string; p_message: string }
        Returns: boolean
      }
      chat_remove_member: {
        Args: { p_ban?: boolean; p_channel: string; p_user: string }
        Returns: undefined
      }
      chat_report_message: {
        Args: { p_details?: string; p_message: string; p_reason: string }
        Returns: undefined
      }
      chat_search_messages: {
        Args: { p_channel: string; p_limit?: number; p_query: string }
        Returns: Json[]
      }
      chat_send_message: {
        Args: { p_channel: string; p_content: string; p_reply_to?: string }
        Returns: Json
      }
      chat_set_moderator: {
        Args: { p_channel: string; p_is_mod: boolean; p_user: string }
        Returns: undefined
      }
      chat_update_room: {
        Args: { p_channel: string; p_description: string; p_name: string }
        Returns: undefined
      }
      check_password_change_rate_limit: { Args: never; Returns: Json }
      claim_timeout: { Args: { p_game_id: string }; Returns: boolean }
      community_award: {
        Args: { p_code: string; p_label: string; p_user: string }
        Returns: undefined
      }
      community_check_achievements: {
        Args: { p_user: string }
        Returns: undefined
      }
      community_feed: {
        Args: {
          p_author?: string
          p_limit?: number
          p_mode?: string
          p_offset?: number
          p_search?: string
          p_tag?: string
        }
        Returns: Json[]
      }
      community_follow_list: {
        Args: { p_kind: string; p_limit?: number; p_user: string }
        Returns: Json[]
      }
      community_get_comments: { Args: { p_post_id: string }; Returns: Json[] }
      community_get_post: { Args: { p_id: string }; Returns: Json }
      community_leaderboard: {
        Args: { p_kind?: string; p_limit?: number }
        Returns: Json[]
      }
      community_notify: {
        Args: {
          p_body: string
          p_kind: string
          p_link: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      community_post_json: {
        Args: {
          p: Database["public"]["Tables"]["community_posts"]["Row"]
          p_viewer: string
        }
        Returns: Json
      }
      community_profile: { Args: { p_username: string }; Returns: Json }
      community_react: {
        Args: { p_reaction: string; p_target_id: string; p_target_type: string }
        Returns: string
      }
      community_search_users: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json[]
      }
      community_share_post: { Args: { p_post_id: string }; Returns: undefined }
      community_suggested_users: { Args: { p_limit?: number }; Returns: Json[] }
      community_toggle_bookmark: {
        Args: { p_collection?: string; p_post_id: string }
        Returns: boolean
      }
      community_toggle_follow: { Args: { p_target: string }; Returns: boolean }
      community_trending_tags: { Args: { p_limit?: number }; Returns: Json[] }
      community_vote_poll: {
        Args: { p_option: number; p_post_id: string }
        Returns: undefined
      }
      create_challenge: {
        Args: {
          p_host_color?: string
          p_increment_seconds: number
          p_initial_seconds: number
          p_is_rated: boolean
          p_time_class: Database["public"]["Enums"]["time_class"]
          p_time_control: string
        }
        Returns: string
      }
      create_tournament_for_category: {
        Args: { p_category_key: string }
        Returns: string
      }
      credit_premium_bonus: {
        Args: {
          p_base_coins: number
          p_idempotency_key: string
          p_plan_name: string
        }
        Returns: undefined
      }
      credit_wallet_deposit: {
        Args: {
          p_amount: number
          p_order_id: string
          p_payment_id: string
          p_user_id: string
        }
        Returns: Json
      }
      current_rating: {
        Args: {
          p_time_class: Database["public"]["Enums"]["time_class"]
          p_user_id: string
        }
        Returns: number
      }
      distribute_prize_atomic: {
        Args: {
          p_amount: number
          p_description: string
          p_rank: number
          p_tournament_id: string
          p_user_id: string
        }
        Returns: Json
      }
      distribute_tournament_prizes_v2: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      ensure_tournament_slots: { Args: never; Returns: Json }
      handle_no_show: { Args: { p_match_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_clan_wars: {
        Args: { p_clan_id: string; p_won: boolean }
        Returns: undefined
      }
      increment_profile_trophy: {
        Args: { p_trophy_type: string; p_user_id: string }
        Returns: undefined
      }
      increment_tournament_players: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      increment_tournament_score: {
        Args: {
          p_drew: number
          p_round: number
          p_score: number
          p_tournament_id: string
          p_user_id: string
          p_won: number
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      join_free_tournament_atomic: {
        Args: { p_tournament_id: string; p_user_id: string }
        Returns: Json
      }
      join_game: { Args: { p_game_id: string }; Returns: string }
      join_paid_tournament_atomic: {
        Args: { p_fee: number; p_tournament_id: string; p_user_id: string }
        Returns: Json
      }
      join_public_room_atomic:
        | { Args: { p_room_id: string; p_user_id: string }; Returns: Json }
        | {
            Args: {
              p_device_id?: string
              p_room_id: string
              p_socket_id?: string
              p_user_id: string
            }
            Returns: Json
          }
      join_tournament_paid: { Args: { p_tournament_id: string }; Returns: Json }
      leave_public_room_atomic: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: Json
      }
      leave_queue: { Args: never; Returns: undefined }
      lock_tournament: { Args: { p_tournament_id: string }; Returns: Json }
      lock_wallet_withdraw: {
        Args: { p_amount: number; p_upi_id: string; p_user_id: string }
        Returns: Json
      }
      log_password_change_attempt: {
        Args: { p_reason?: string; p_success: boolean; p_user_agent?: string }
        Returns: undefined
      }
      matchmake: {
        Args: {
          p_increment_seconds: number
          p_initial_seconds: number
          p_time_class: Database["public"]["Enums"]["time_class"]
          p_time_control: string
        }
        Returns: string
      }
      process_match_result_atomic: {
        Args: {
          p_drew: boolean
          p_iq_change: number
          p_lost: boolean
          p_user_id: string
          p_won: boolean
        }
        Returns: undefined
      }
      process_withdraw_atomic: {
        Args: {
          p_action: string
          p_admin_id: string
          p_admin_note?: string
          p_request_id: string
        }
        Returns: Json
      }
      record_tournament_match_result:
        | {
            Args: {
              p_loser_id: string
              p_match_id: string
              p_material_score?: number
              p_time_used_ms?: number
              p_winner_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_loser_id: string
              p_match_id: string
              p_material_score?: number
              p_time_used_ms?: number
              p_winner_id: string
            }
            Returns: Json
          }
      refund_tournament_entry: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      replenish_tournament_category: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      resign_game: { Args: { p_game_id: string }; Returns: undefined }
      respond_draw: { Args: { p_game_id: string }; Returns: string }
      review_kyc_atomic: {
        Args: {
          p_action: string
          p_admin_id: string
          p_rejection_reason?: string
          p_request_id: string
        }
        Returns: Json
      }
      save_bank_details: {
        Args: {
          p_account_holder_name: string
          p_account_number: string
          p_account_type: string
          p_bank_name: string
          p_branch_address: string
          p_branch_name: string
          p_ifsc_code: string
        }
        Returns: string
      }
      save_computer_game: {
        Args: {
          p_engine_name: string
          p_final_fen?: string
          p_moves?: Json
          p_moves_count: number
          p_my_color: string
          p_pgn: string
          p_result: Database["public"]["Enums"]["game_result"]
        }
        Returns: string
      }
      save_game_analysis: {
        Args: {
          p_accuracy_black: number
          p_accuracy_white: number
          p_acpl_black: number
          p_acpl_white: number
          p_class_counts_black: Json
          p_class_counts_white: Json
          p_game_id: string
          p_move_evals?: Json
          p_opening_eco?: string
          p_opening_name?: string
        }
        Returns: undefined
      }
      save_local_game: {
        Args: {
          p_end_reason: string
          p_final_fen?: string
          p_moves?: Json
          p_moves_count: number
          p_my_color: string
          p_opponent_name: string
          p_pgn: string
          p_result: Database["public"]["Enums"]["game_result"]
        }
        Returns: string
      }
      start_tournament_round: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      update_arena_player_stats: {
        Args: {
          p_draw: boolean
          p_loss: boolean
          p_points: number
          p_tournament_id: string
          p_user_id: string
          p_win: boolean
        }
        Returns: undefined
      }
      update_clan_member_count: {
        Args: { p_clan_id: string; p_delta: number }
        Returns: undefined
      }
      update_clan_war_scores: {
        Args: {
          p_score_a_delta: number
          p_score_b_delta: number
          p_war_id: string
        }
        Returns: undefined
      }
      update_login_streak: { Args: never; Returns: undefined }
      update_match_streak_for_user: {
        Args: { p_uid: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      club_role: "owner" | "admin" | "member"
      friend_status: "pending" | "accepted" | "blocked"
      game_result: "white" | "black" | "draw" | "ongoing" | "aborted"
      premium_tier: "free" | "gold" | "platinum" | "maharaja"
      subscription_status:
        | "active"
        | "cancelled"
        | "past_due"
        | "trialing"
        | "inactive"
      time_class: "bullet" | "blitz" | "rapid" | "classical" | "correspondence"
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
      app_role: ["admin", "moderator", "user"],
      club_role: ["owner", "admin", "member"],
      friend_status: ["pending", "accepted", "blocked"],
      game_result: ["white", "black", "draw", "ongoing", "aborted"],
      premium_tier: ["free", "gold", "platinum", "maharaja"],
      subscription_status: [
        "active",
        "cancelled",
        "past_due",
        "trialing",
        "inactive",
      ],
      time_class: ["bullet", "blitz", "rapid", "classical", "correspondence"],
    },
  },
} as const
