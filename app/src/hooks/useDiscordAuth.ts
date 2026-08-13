import { useEffect, useRef, useState } from "react";
import { normalizeDiscordUser } from "../utils/discordRoles";

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
const DISCORD_OAUTH_STATE_KEY = "discord_oauth_state";

function createOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getCachedUser(): DiscordUser | null {
  try {
    const cachedUserRaw = localStorage.getItem("discord_user");
    return cachedUserRaw ? normalizeDiscordUser(JSON.parse(cachedUserRaw) as DiscordUser) : null;
  } catch {
    return null;
  }
}

function getCachedAuthState(): AuthState {
  try {
    const cachedUser = getCachedUser();

    if (cachedUser) {
      return {
        isLoading: true,
        isAuthed: true,
        user: cachedUser,
        error: null,
      };
    }
  } catch {
    // Fall back to a fresh auth check if cached state is unreadable.
  }

  return {
    isLoading: true,
    isAuthed: false,
    user: null,
    error: null,
  };
}

export function useDiscordAuth(): AuthState & {
  login: () => void;
  logout: () => Promise<void>;
  hasRole: (roleId: string) => boolean;
} {
  const [discordClientId, setDiscordClientId] = useState("");
  const [state, setState] = useState<AuthState>(getCachedAuthState);
  const authGenerationRef = useRef(0);

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
    if (new URLSearchParams(window.location.search).has("code")) return;
    const generation = ++authGenerationRef.current;

    const checkAuth = async () => {
      try {
        const cachedUser = getCachedUser();

        if (cachedUser) {
          setState({
            isLoading: true,
            isAuthed: true,
            user: cachedUser,
            error: null,
          });
        }

        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (generation !== authGenerationRef.current) return;

        if (!response.ok) {
          if (response.status !== 401 && response.status !== 403 && cachedUser) {
            setState((prev) => ({ ...prev, isLoading: false, isAuthed: true, user: cachedUser, error: null }));
            return;
          }
          localStorage.removeItem("discord_user");
          setState({
            isLoading: false,
            isAuthed: false,
            user: null,
            error: null,
          });
          return;
        }

        const payload = await response.json() as { ok: boolean; data: DiscordUser };
        if (generation !== authGenerationRef.current) return;
        if (!payload.ok || !payload.data) {
          localStorage.removeItem("discord_user");
          setState({
            isLoading: false,
            isAuthed: false,
            user: null,
            error: null,
          });
          return;
        }

        const user = normalizeDiscordUser(payload.data);
        localStorage.setItem("discord_user", JSON.stringify(user));
        setState({
          isLoading: false,
          isAuthed: true,
          user,
          error: null,
        });
      } catch (err) {
        if (generation !== authGenerationRef.current) return;
        console.error("Auth check failed:", err);
        const cachedUser = getCachedUser();
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
      const generation = ++authGenerationRef.current;

      const returnedState = params.get("state");
      const expectedState = sessionStorage.getItem(DISCORD_OAUTH_STATE_KEY);
      sessionStorage.removeItem(DISCORD_OAUTH_STATE_KEY);
      if (!returnedState || !expectedState || returnedState !== expectedState) {
        window.history.replaceState({}, document.title, window.location.pathname);
        setState((prev) => ({ ...prev, isLoading: false, error: "Invalid Discord login state. Please try again." }));
        return;
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        const response = await fetch("/api/auth/discord", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code, redirectUri: DISCORD_REDIRECT_URI }),
        });
        if (generation !== authGenerationRef.current) return;

        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { ok?: boolean; error?: { message?: string } } | null;
          throw new Error(payload?.error?.message || "OAuth exchange failed");
        }

        const payload = await response.json() as { ok: boolean; data: { user: DiscordUser } };
        if (generation !== authGenerationRef.current) return;
        if (!payload.ok || !payload.data?.user) {
          throw new Error("OAuth exchange failed");
        }
        const user = normalizeDiscordUser(payload.data.user);
        localStorage.setItem("discord_user", JSON.stringify(user));

        setState({
          isLoading: false,
          isAuthed: true,
          user,
          error: null,
        });

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        if (generation !== authGenerationRef.current) return;
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
        const oauthState = createOAuthState();
        sessionStorage.setItem(DISCORD_OAUTH_STATE_KEY, oauthState);
        const url = new URL("https://discord.com/api/oauth2/authorize");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", scope);
        url.searchParams.set("state", oauthState);

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

  const logout = async () => {
    authGenerationRef.current += 1;
    localStorage.removeItem("discord_user");
    setState({
      isLoading: false,
      isAuthed: false,
      user: null,
      error: null,
    });

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
      if (!response.ok) throw new Error(`Logout failed (${response.status})`);
    } catch (error) {
      console.error("Logout request failed:", error);
      setState((previous) => ({
        ...previous,
        error: "Logout could not be confirmed. Please try again before closing this browser.",
      }));
    }
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
