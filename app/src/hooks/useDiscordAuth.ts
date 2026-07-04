import { useEffect, useState } from "react";

export interface DiscordUser {
  id: string;
  username: string;
  avatar?: string;
  roles: string[];
  appRole: "TL" | "Pilot";
}

export interface AuthState {
  isLoading: boolean;
  isAuthed: boolean;
  user: DiscordUser | null;
  error: string | null;
}

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || "";
const DISCORD_REDIRECT_URI = `${window.location.origin}/auth/callback`;
const DISCORD_SNOWFLAKE_REGEX = /^\d{17,20}$/;

export function useDiscordAuth(): AuthState & {
  login: () => void;
  logout: () => void;
  hasRole: (roleId: string) => boolean;
} {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthed: false,
    user: null,
    error: null,
  });

  // Check if already authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("discord_token");
        if (!token) {
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          localStorage.removeItem("discord_token");
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const payload = await response.json() as { ok: boolean; data: DiscordUser };
        if (!payload.ok || !payload.data) {
          localStorage.removeItem("discord_token");
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const user = payload.data;
        localStorage.setItem("discord_user", JSON.stringify(user));
        setState({
          isLoading: false,
          isAuthed: true,
          user,
          error: null,
        });
      } catch (err) {
        console.error("Auth check failed:", err);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Auth check failed",
        }));
      }
    };

    checkAuth();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (!code) return;

      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        const response = await fetch("/api/auth/discord", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirectUri: DISCORD_REDIRECT_URI }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { ok?: boolean; error?: { message?: string } } | null;
          throw new Error(payload?.error?.message || "OAuth exchange failed");
        }

        const payload = await response.json() as { ok: boolean; data: { token: string; user: DiscordUser } };
        if (!payload.ok || !payload.data?.token || !payload.data?.user) {
          throw new Error("OAuth exchange failed");
        }
        localStorage.setItem("discord_token", payload.data.token);
        localStorage.setItem("discord_user", JSON.stringify(payload.data.user));

        setState({
          isLoading: false,
          isAuthed: true,
          user: payload.data.user,
          error: null,
        });

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.error("OAuth callback failed:", err);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "OAuth failed",
        }));
      }
    };

    handleCallback();
  }, []);

  const login = () => {
    if (!DISCORD_CLIENT_ID || DISCORD_CLIENT_ID.includes("YOUR_DISCORD_CLIENT_ID")) {
      setState((prev) => ({
        ...prev,
        error: "Discord client ID is not configured. Set VITE_DISCORD_CLIENT_ID in app/.env.local.",
      }));
      return;
    }

    if (!DISCORD_SNOWFLAKE_REGEX.test(DISCORD_CLIENT_ID)) {
      setState((prev) => ({
        ...prev,
        error: "Discord client ID must be a numeric snowflake (17-20 digits).",
      }));
      return;
    }

    const scope = "identify guilds.members.read";
    const url = new URL("https://discord.com/api/oauth2/authorize");
    url.searchParams.set("client_id", DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scope);

    window.location.href = url.toString();
  };

  const logout = () => {
    localStorage.removeItem("discord_token");
    localStorage.removeItem("discord_user");
    setState({
      isLoading: false,
      isAuthed: false,
      user: null,
      error: null,
    });
  };

  const hasRole = (roleId: string): boolean => {
    return state.user?.roles.includes(roleId) ?? false;
  };

  return {
    ...state,
    login,
    logout,
    hasRole,
  };
}
