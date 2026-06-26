export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      club_members: {
        Row: {
          club_id: string;
          id: string;
          joined_at: string;
          role: Database["public"]["Enums"]["club_role"];
          user_id: string;
        };
        Insert: {
          club_id: string;
          id?: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["club_role"];
          user_id: string;
        };
        Update: {
          club_id?: string;
          id?: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["club_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      clubs: {
        Row: {
          banner_url: string | null;
          cover_gradient: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_public: boolean;
          member_count: number;
          name: string;
          owner_id: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          banner_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          member_count?: number;
          name: string;
          owner_id: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          banner_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          member_count?: number;
          name?: string;
          owner_id?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      friends: {
        Row: {
          addressee_id: string;
          created_at: string;
          id: string;
          requester_id: string;
          status: Database["public"]["Enums"]["friend_status"];
          updated_at: string;
        };
        Insert: {
          addressee_id: string;
          created_at?: string;
          id?: string;
          requester_id: string;
          status?: Database["public"]["Enums"]["friend_status"];
          updated_at?: string;
        };
        Update: {
          addressee_id?: string;
          created_at?: string;
          id?: string;
          requester_id?: string;
          status?: Database["public"]["Enums"]["friend_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      game_chat: {
        Row: {
          body: string;
          created_at: string;
          game_id: string;
          id: number;
          user_id: string;
          username: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          game_id: string;
          id?: number;
          user_id: string;
          username: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          game_id?: string;
          id?: number;
          user_id?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_chat_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      game_moves: {
        Row: {
          by_user: string | null;
          created_at: string;
          fen_after: string;
          game_id: string;
          id: number;
          ply: number;
          san: string;
          time_left_ms: number | null;
          uci: string;
        };
        Insert: {
          by_user?: string | null;
          created_at?: string;
          fen_after: string;
          game_id: string;
          id?: number;
          ply: number;
          san: string;
          time_left_ms?: number | null;
          uci: string;
        };
        Update: {
          by_user?: string | null;
          created_at?: string;
          fen_after?: string;
          game_id?: string;
          id?: number;
          ply?: number;
          san?: string;
          time_left_ms?: number | null;
          uci?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_moves_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      games: {
        Row: {
          black_id: string | null;
          black_rating: number | null;
          black_time_ms: number;
          black_username: string | null;
          created_at: string;
          draw_offered_by: string | null;
          end_reason: string | null;
          ended_at: string | null;
          fen: string;
          host_id: string | null;
          id: string;
          increment_seconds: number;
          initial_seconds: number;
          is_rated: boolean;
          last_move_at: string | null;
          moves_count: number;
          opening: string | null;
          pgn: string;
          result: Database["public"]["Enums"]["game_result"];
          status: string;
          time_class: Database["public"]["Enums"]["time_class"];
          time_control: string;
          turn: string;
          vs_computer: boolean;
          white_id: string | null;
          white_rating: number | null;
          white_time_ms: number;
          white_username: string | null;
          winner_id: string | null;
        };
        Insert: {
          black_id?: string | null;
          black_rating?: number | null;
          black_time_ms?: number;
          black_username?: string | null;
          created_at?: string;
          draw_offered_by?: string | null;
          end_reason?: string | null;
          ended_at?: string | null;
          fen?: string;
          host_id?: string | null;
          id?: string;
          increment_seconds?: number;
          initial_seconds?: number;
          is_rated?: boolean;
          last_move_at?: string | null;
          moves_count?: number;
          opening?: string | null;
          pgn?: string;
          result?: Database["public"]["Enums"]["game_result"];
          status?: string;
          time_class?: Database["public"]["Enums"]["time_class"];
          time_control?: string;
          turn?: string;
          vs_computer?: boolean;
          white_id?: string | null;
          white_rating?: number | null;
          white_time_ms?: number;
          white_username?: string | null;
          winner_id?: string | null;
        };
        Update: {
          black_id?: string | null;
          black_rating?: number | null;
          black_time_ms?: number;
          black_username?: string | null;
          created_at?: string;
          draw_offered_by?: string | null;
          end_reason?: string | null;
          ended_at?: string | null;
          fen?: string;
          host_id?: string | null;
          id?: string;
          increment_seconds?: number;
          initial_seconds?: number;
          is_rated?: boolean;
          last_move_at?: string | null;
          moves_count?: number;
          opening?: string | null;
          pgn?: string;
          result?: Database["public"]["Enums"]["game_result"];
          status?: string;
          time_class?: Database["public"]["Enums"]["time_class"];
          time_control?: string;
          turn?: string;
          vs_computer?: boolean;
          white_id?: string | null;
          white_rating?: number | null;
          white_time_ms?: number;
          white_username?: string | null;
          winner_id?: string | null;
        };
        Relationships: [];
      };
      news_articles: {
        Row: {
          author_id: string | null;
          author_name: string | null;
          body: string;
          category: string | null;
          cover_gradient: string | null;
          cover_image: string | null;
          created_at: string;
          excerpt: string | null;
          id: string;
          is_featured: boolean;
          published: boolean;
          published_at: string | null;
          read_time_min: number | null;
          slug: string;
          title: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          cover_image?: string | null;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          published?: boolean;
          published_at?: string | null;
          slug: string;
          title: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          cover_image?: string | null;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          published?: boolean;
          published_at?: string | null;
          slug?: string;
          title?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          link: string | null;
          read: boolean;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          link?: string | null;
          read?: boolean;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          read?: boolean;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          country: string | null;
          created_at: string;
          display_name: string;
          id: string;
          premium_tier: Database["public"]["Enums"]["premium_tier"];
          title: string | null;
          updated_at: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          country?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          premium_tier?: Database["public"]["Enums"]["premium_tier"];
          title?: string | null;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          premium_tier?: Database["public"]["Enums"]["premium_tier"];
          title?: string | null;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      puzzle_attempts: {
        Row: {
          attempted_at: string;
          id: string;
          puzzle_id: string;
          rating_change: number;
          solved: boolean;
          time_ms: number;
          user_id: string;
        };
        Insert: {
          attempted_at?: string;
          id?: string;
          puzzle_id: string;
          rating_change?: number;
          solved: boolean;
          time_ms?: number;
          user_id: string;
        };
        Update: {
          attempted_at?: string;
          id?: string;
          puzzle_id?: string;
          rating_change?: number;
          solved?: boolean;
          time_ms?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "puzzle_attempts_puzzle_id_fkey";
            columns: ["puzzle_id"];
            isOneToOne: false;
            referencedRelation: "puzzles";
            referencedColumns: ["id"];
          },
        ];
      };
      puzzles: {
        Row: {
          created_at: string;
          fen: string;
          goal: string;
          id: string;
          moves: string;
          popularity: number;
          rating: number;
          theme: string;
          themes: string[];
        };
        Insert: {
          created_at?: string;
          fen: string;
          id?: string;
          moves: string;
          popularity?: number;
          rating?: number;
          themes?: string[];
        };
        Update: {
          created_at?: string;
          fen?: string;
          id?: string;
          moves?: string;
          popularity?: number;
          rating?: number;
          themes?: string[];
        };
        Relationships: [];
      };
      ratings: {
        Row: {
          draws: number;
          games_played: number;
          id: string;
          losses: number;
          peak_rating: number;
          rating: number;
          time_class: Database["public"]["Enums"]["time_class"];
          updated_at: string;
          user_id: string;
          wins: number;
        };
        Insert: {
          draws?: number;
          games_played?: number;
          id?: string;
          losses?: number;
          peak_rating?: number;
          rating?: number;
          time_class: Database["public"]["Enums"]["time_class"];
          updated_at?: string;
          user_id: string;
          wins?: number;
        };
        Update: {
          draws?: number;
          games_played?: number;
          id?: string;
          losses?: number;
          peak_rating?: number;
          rating?: number;
          time_class?: Database["public"]["Enums"]["time_class"];
          updated_at?: string;
          user_id?: string;
          wins?: number;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          id: string;
          provider: string | null;
          provider_subscription_id: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          tier: Database["public"]["Enums"]["premium_tier"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          provider?: string | null;
          provider_subscription_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          tier?: Database["public"]["Enums"]["premium_tier"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          provider?: string | null;
          provider_subscription_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          tier?: Database["public"]["Enums"]["premium_tier"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tournament_entries: {
        Row: {
          id: string;
          joined_at: string;
          rank: number | null;
          score: number;
          tournament_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          joined_at?: string;
          rank?: number | null;
          score?: number;
          tournament_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          joined_at?: string;
          rank?: number | null;
          score?: number;
          tournament_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tournament_entries_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      tournaments: {
        Row: {
          cover_gradient: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string | null;
          format: string;
          id: string;
          max_players: number;
          name: string;
          player_count: number;
          prize_pool: string | null;
          slug: string;
          starts_at: string;
          status: string;
          time_control: string;
          winner_display: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          format?: string;
          id?: string;
          max_players?: number;
          name: string;
          prize_pool?: string | null;
          slug: string;
          starts_at: string;
          time_control?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          format?: string;
          id?: string;
          max_players?: number;
          name?: string;
          prize_pool?: string | null;
          slug?: string;
          starts_at?: string;
          time_control?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      apply_elo_change: {
        Args: { p_game_id: string };
        Returns: undefined;
      };
      current_rating: {
        Args: {
          p_user_id: string;
          p_time_class: Database["public"]["Enums"]["time_class"];
        };
        Returns: number;
      };
      create_challenge: {
        Args: {
          p_time_class: Database["public"]["Enums"]["time_class"];
          p_time_control: string;
          p_initial_seconds: number;
          p_increment_seconds: number;
          p_is_rated: boolean;
          p_host_color: string;
        };
        Returns: string;
      };
      join_game: {
        Args: { p_game_id: string };
        Returns: string;
      };
      matchmake: {
        Args: {
          p_time_class: Database["public"]["Enums"]["time_class"];
          p_time_control: string;
          p_initial_seconds: number;
          p_increment_seconds: number;
        };
        Returns: string;
      };
      leave_queue: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      resign_game: {
        Args: { p_game_id: string };
        Returns: undefined;
      };
      respond_draw: {
        Args: { p_game_id: string };
        Returns: string;
      };
      claim_timeout: {
        Args: { p_game_id: string };
        Returns: boolean;
      };
      save_computer_game: {
        Args: {
          p_my_color: string;
          p_result: Database["public"]["Enums"]["game_result"];
          p_pgn: string;
          p_moves_count: number;
          p_engine_name: string;
        };
        Returns: string;
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
      club_role: "owner" | "admin" | "member";
      friend_status: "pending" | "accepted" | "blocked";
      game_result: "white" | "black" | "draw" | "ongoing" | "aborted";
      premium_tier: "free" | "gold" | "platinum" | "maharaja";
      subscription_status: "active" | "cancelled" | "past_due" | "trialing" | "inactive";
      time_class: "bullet" | "blitz" | "rapid" | "classical" | "correspondence";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      club_role: ["owner", "admin", "member"],
      friend_status: ["pending", "accepted", "blocked"],
      game_result: ["white", "black", "draw", "ongoing", "aborted"],
      premium_tier: ["free", "gold", "platinum", "maharaja"],
      subscription_status: ["active", "cancelled", "past_due", "trialing", "inactive"],
      time_class: ["bullet", "blitz", "rapid", "classical", "correspondence"],
    },
  },
} as const;
