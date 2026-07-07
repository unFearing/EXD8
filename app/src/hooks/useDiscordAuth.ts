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

const DISCORD_REDIRECT_URI = `${window.location.origin}/auth/callback`;
const DISCORD_SNOWFLAKE_REGEX = /^\d{17,20}$/;

export function useDiscordAuth(): AuthState & {
  login: () => void;
  logout: () => void;
  hasRole: (roleId: string) => boolean;
} {
  const [discordClientId, setDiscordClientId] = useState("");
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthed: false,
    user: null,
    error: null,
  });

  const loadDiscordClientId = async (): Promise<string> => {
    if (discordClientId) return discordClientId;

    const response = await fetch("/api/auth/config");
    if (!response.ok) {
      throw new Error("Failed to load Discord OAuth configuration");
    }

    const payload = await response.json() as { ok?: boolean; data?: { clientId?: string } };
    const clientId = payload?.ok ? payload.data?.clientId ?? "" : "";
    setDiscordClientId(clientId);
    return clientId;
  };

  // Check if already authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("discord_token");
        const cachedUserRaw = localStorage.getItem("discord_user");
        const cachedUser = cachedUserRaw ? (JSON.parse(cachedUserRaw) as DiscordUser) : null;

        if (cachedUser && token) {
          setState({
            isLoading: true,
            isAuthed: true,
            user: cachedUser,
            error: null,
          });
        }

        if (!token) {
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          if (response.status >= 500 && cachedUser) {
            setState((prev) => ({ ...prev, isLoading: false, isAuthed: true, user: cachedUser, error: null }));
            return;
          }
          localStorage.removeItem("discord_token");
          localStorage.removeItem("discord_user");
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const payload = await response.json() as { ok: boolean; data: DiscordUser };
        if (!payload.ok || !payload.data) {
          localStorage.removeItem("discord_token");
          localStorage.removeItem("discord_user");
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
        const cachedUserRaw = localStorage.getItem("discord_user");
        const cachedUser = cachedUserRaw ? (JSON.parse(cachedUserRaw) as DiscordUser) : null;
        if (cachedUser) {
          setState((prev) => ({ ...prev, isLoading: false, isAuthed: true, user: cachedUser, error: null }));
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: "Auth check failed",
          }));
        }
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

  useEffect(() => {
    loadDiscordClientId().catch(() => {
      // Login handler reports the visible error when a user attempts to sign in.
    });
  }, []);

  const login = () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    void (async () => {
      try {
        const clientId = await loadDiscordClientId();

        if (!clientId || clientId.includes("YOUR_DISCORD_CLIENT_ID")) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: "Discord client ID is not configured in API environment variables.",
          }));
          return;
        }

        if (!DISCORD_SNOWFLAKE_REGEX.test(clientId)) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: "Discord client ID must be a numeric snowflake (17-20 digits).",
          }));
          return;
        }

        const scope = "identify guilds.members.read";
        const url = new URL("https://discord.com/api/oauth2/authorize");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", scope);

        window.location.href = url.toString();
      } catch {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to load Discord OAuth configuration from API.",
        }));
      }
    })();
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
