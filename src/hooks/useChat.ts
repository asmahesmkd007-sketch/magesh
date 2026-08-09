// =====================================================================
// CHAT HOOKS
// ---------------------------------------------------------------------
// Channel lists, message feeds, realtime message/reaction subscriptions,
// and mutations for the ChessOX chat system (Global Chat, Rooms, DMs).
// =====================================================================
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import * as api from "@/lib/api/chatClient";
import type { ChatMessage } from "@/lib/api/chatClient";

export function useMyChannels() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chat_my_channels", user?.id],
    queryFn: api.fetchMyChannels,
    enabled: !!user,
    staleTime: 10_000,
  });
}

export function useDiscoverRooms(search?: string) {
  return useQuery({
    queryKey: ["chat_discover_rooms", search ?? null],
    queryFn: () => api.discoverRooms(search),
    staleTime: 15_000,
  });
}

export function useDiscoverPrivateRooms(search?: string) {
  return useQuery({
    queryKey: ["chat_discover_private_rooms", search ?? null],
    queryFn: () => api.discoverPrivateRooms(search),
    staleTime: 15_000,
  });
}

export function usePermanentRooms() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chat_permanent_rooms", user?.id ?? null],
    queryFn: api.fetchPermanentRooms,
    staleTime: 30_000,
  });
}

export function useChannel(slugOrId: string | undefined) {
  return useQuery({
    queryKey: ["chat_channel", slugOrId],
    queryFn: () => api.fetchChannel(slugOrId!),
    enabled: !!slugOrId,
  });
}

export function useChannelMembers(channelId: string | undefined) {
  return useQuery({
    queryKey: ["chat_channel_members", channelId],
    queryFn: () => api.fetchChannelMembers(channelId!),
    enabled: !!channelId,
  });
}

export function usePinnedMessages(channelId: string | undefined) {
  return useQuery({
    queryKey: ["chat_pinned", channelId],
    queryFn: () => api.fetchPinnedMessages(channelId!),
    enabled: !!channelId,
  });
}

export function useChannelFeed(channelId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["chat_feed", channelId],
    queryFn: ({ pageParam }) => api.fetchChannelFeed(channelId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.length < api.PAGE_SIZE ? undefined : lastPage[lastPage.length - 1]?.created_at,
    enabled: !!channelId,
    staleTime: 5_000,
  });
}

/** Realtime: new/edited messages and reaction changes in one channel. */
export function useChannelRealtime(channelId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!channelId) return;

    const ch = supabase
      .channel(`chat_realtime:${channelId}`)
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        if (!payload || !payload.id) return;
        const msg = payload as ChatMessage;
        queryClient.setQueryData<{ pages: ChatMessage[][]; pageParams: unknown[] }>(
          ["chat_feed", channelId],
          (old) => {
            if (!old) return old;
            const exists = old.pages.some((page) => page.some((m) => m.id === msg.id));
            if (exists) return old;
            return {
              ...old,
              pages: [[msg, ...old.pages[0]], ...old.pages.slice(1)],
            };
          },
        );
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
        },
        () => {
          queryClient.refetchQueries({ queryKey: ["chat_feed", channelId] });
          queryClient.refetchQueries({ queryKey: ["chat_my_channels"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => {
        queryClient.refetchQueries({ queryKey: ["chat_feed", channelId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId, queryClient]);
}

/** Realtime: refresh the sidebar channel list on any message activity. */
export function useMyChannelsRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] });
      }, 500);
    };
    const ch = supabase
      .channel(`chat_channels:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_channel_members" },
        invalidate,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [user, queryClient]);
}

/** Ephemeral typing indicator: broadcast-only (no DB writes/history). */
export function useTypingIndicator(channelId: string | undefined) {
  const { user } = useAuth();
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!channelId) return;
    const ch = supabase.channel(`chat_typing:${channelId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const name = payload?.name as string | undefined;
      const uid = payload?.uid as string | undefined;
      if (!name || uid === user?.id) return;
      setTypingNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
      const existing = timers.current.get(name);
      if (existing) clearTimeout(existing);
      timers.current.set(
        name,
        setTimeout(() => setTypingNames((prev) => prev.filter((n) => n !== name)), 3000),
      );
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [channelId, user?.id]);

  const sendTyping = (name: string) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { name, uid: user?.id },
    });
  };

  return { typingNames, sendTyping };
}

export function useChatActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const requireAuth = (): string => {
    if (!user) throw new Error("Sign in to use chat.");
    return user.id;
  };

  const send = useMutation({
    mutationFn: ({
      channelId,
      content,
      replyToId,
    }: {
      channelId: string;
      content: string;
      replyToId?: string | null;
    }) => {
      requireAuth();
      return api.sendMessage(channelId, content, replyToId);
    },
    onSuccess: (msg, { channelId }) => {
      queryClient.setQueryData<{ pages: ChatMessage[][]; pageParams: unknown[] }>(
        ["chat_feed", channelId],
        (old) => {
          if (!old) return old;
          const exists = old.pages.some((page) => page.some((m) => m.id === msg.id));
          if (exists) return old;
          return { ...old, pages: [[msg, ...old.pages[0]], ...old.pages.slice(1)] };
        },
      );
      queryClient.refetchQueries({ queryKey: ["chat_my_channels"] });

      // Broadcast to all connected clients for instant message delivery
      const bch = supabase.channel(`chat_realtime:${channelId}`);
      bch.send({
        type: "broadcast",
        event: "new_message",
        payload: msg,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send message"),
  });

  const remove = useMutation({
    mutationFn: (messageId: string) => api.deleteMessage(messageId),
    onSuccess: (_d, _messageId) => {
      queryClient.invalidateQueries({ queryKey: ["chat_feed"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const react = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      requireAuth();
      return api.reactToMessage(messageId, emoji);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["chat_feed"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to react"),
  });

  const pin = useMutation({
    mutationFn: ({
      messageId,
      pinned,
    }: {
      messageId: string;
      pinned: boolean;
      channelId?: string;
    }) => api.pinMessage(messageId, pinned),
    onSuccess: (_d, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ["chat_feed"] });
      if (channelId) queryClient.invalidateQueries({ queryKey: ["chat_pinned", channelId] });
      toast.success("Updated pinned messages");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to pin"),
  });

  const report = useMutation({
    mutationFn: (args: { messageId: string; reason: api.ChatReportReason; details?: string }) =>
      api.reportMessage(args.messageId, args.reason, args.details),
    onSuccess: () => toast.success("Report submitted"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to report"),
  });

function formatChatError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e ?? fallback);
  if (
    msg.includes("chat_channels_slug_key") ||
    msg.includes("duplicate key") ||
    msg.includes("unique constraint")
  ) {
    return "This Room ID is already taken. Please choose a different Room ID.";
  }
  if (msg.includes("chat_channels_name_key")) {
    return "A room with this name already exists. Please choose a different name.";
  }
  return msg;
}

  const createRoom = useMutation({
    mutationFn: (args: {
      name: string;
      description: string;
      isPrivate: boolean;
      icon?: string;
      maxMembers?: number | null;
      password?: string | null;
      roomId?: string | null;
    }) =>
      api.createRoom(
        args.name,
        args.description,
        args.isPrivate,
        args.icon,
        args.maxMembers,
        args.password,
        args.roomId,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] });
      queryClient.invalidateQueries({ queryKey: ["chat_discover_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["chat_discover_private_rooms"] });
      toast.success("Room created");
    },
    onError: (e) => toast.error(formatChatError(e, "Failed to create room")),
  });

  const joinPrivateRoom = useMutation({
    mutationFn: (args: { roomCode: string; password: string }) =>
      api.joinPrivateRoom(args.roomCode, args.password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] });
      queryClient.invalidateQueries({ queryKey: ["chat_discover_private_rooms"] });
      toast.success("Joined room");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to join room"),
  });

  const updateRoom = useMutation({
    mutationFn: (args: { channelId: string; name: string; description: string }) =>
      api.updateRoom(args.channelId, args.name, args.description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_channel"] });
      queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] });
      toast.success("Room updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update room"),
  });

  const deleteRoom = useMutation({
    mutationFn: (channelId: string) => api.deleteRoom(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] });
      queryClient.invalidateQueries({ queryKey: ["chat_discover_rooms"] });
      toast.success("Room deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete room"),
  });

  const joinRoom = useMutation({
    mutationFn: (channelId: string) => api.joinRoom(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] });
      queryClient.invalidateQueries({ queryKey: ["chat_channel"] });
      toast.success("Joined room");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to join room"),
  });

  const joinPublicRoomBySlug = useMutation({
    mutationFn: (slug: string) => api.joinPublicRoomBySlug(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] });
      queryClient.invalidateQueries({ queryKey: ["chat_discover_rooms"] });
      toast.success("Joined room");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to join room"),
  });

  const leaveRoom = useMutation({
    mutationFn: (channelId: string) => api.leaveRoom(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] });
      toast.success("Left room");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to leave room"),
  });

  const invite = useMutation({
    mutationFn: (args: { channelId: string; username: string }) =>
      api.inviteUser(args.channelId, args.username),
    onSuccess: (_d, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ["chat_channel_members", channelId] });
      toast.success("User invited");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to invite"),
  });

  const removeMember = useMutation({
    mutationFn: (args: { channelId: string; userId: string; ban?: boolean }) =>
      api.removeMember(args.channelId, args.userId, args.ban),
    onSuccess: (_d, { channelId, ban }) => {
      queryClient.invalidateQueries({ queryKey: ["chat_channel_members", channelId] });
      toast.success(ban ? "Member banned" : "Member removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove member"),
  });

  const muteMember = useMutation({
    mutationFn: (args: { channelId: string; userId: string; minutes: number }) =>
      api.muteMember(args.channelId, args.userId, args.minutes),
    onSuccess: (_d, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ["chat_channel_members", channelId] });
      toast.success("Updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to mute member"),
  });

  const setModerator = useMutation({
    mutationFn: (args: { channelId: string; userId: string; isMod: boolean }) =>
      api.setModerator(args.channelId, args.userId, args.isMod),
    onSuccess: (_d, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ["chat_channel_members", channelId] });
      toast.success("Updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update role"),
  });

  const openDm = useMutation({
    mutationFn: (otherUserId: string) => {
      requireAuth();
      return api.getOrCreateDm(otherUserId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to start conversation"),
  });

  const markRead = useMutation({
    mutationFn: (channelId: string) => api.markRead(channelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_my_channels"] }),
  });

  return {
    user,
    send,
    remove,
    react,
    pin,
    report,
    createRoom,
    updateRoom,
    deleteRoom,
    joinRoom,
    joinPublicRoomBySlug,
    joinPrivateRoom,
    leaveRoom,
    invite,
    removeMember,
    muteMember,
    setModerator,
    openDm,
    markRead,
  };
}
