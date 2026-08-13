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
const DISCORD_REQUESTED_PATH_KEY = "discord_requested_path";
const INITIAL_AUTH_STATE: AuthState = {
  isLoading: true,
  isAuthed: false,
  user: null,
  error: null,
};

function createOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getRequestedPath(): string {
  const requestedPath = sessionStorage.getItem(DISCORD_REQUESTED_PATH_KEY);
  if (!requestedPath || !requestedPath.startsWith("/") || requestedPath.startsWith("//")) return "/";

  try {
    const url = new URL(requestedPath, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function isDiscordUser(value: unknown): value is DiscordUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<DiscordUser>;
  return typeof user.id === "string" && user.id.trim().length > 0
    && typeof user.username === "string" && user.username.trim().length > 0
    && Array.isArray(user.roles)
    && user.roles.every((role) => typeof role === "string")
    && (user.appRole === "TL" || user.appRole === "Pilot");
}

async function validateCurrentSession(): Promise<DiscordUser> {
  let response: Response;
  try {
    response = await fetch("/api/auth/me", { credentials: "include" });
  } catch {
    throw new Error("Unable to reach the authentication service. Check your connection and retry.");
  }

  if (response.status === 401) {
    throw new Error("Authentication required. Sign in with Discord to continue.");
  }
  if (response.status === 403) {
    throw new Error("Your Discord account is not authorized for this team. Check your server membership and role.");
  }
  if (!response.ok) {
    throw new Error(`Unable to validate your session. The authentication service returned ${response.status}.`);
  }

  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown } | null;
  if (!payload?.ok || !isDiscordUser(payload.data)) {
    throw new Error("The authentication service returned an invalid response. Please retry.");
  }

  return normalizeDiscordUser(payload.data);
}

export function useDiscordAuth(): AuthState & {
  login: () => void;
  retry: () => void;
  logout: () => Promise<void>;
  hasRole: (roleId: string) => boolean;
} {
  const [discordClientId, setDiscordClientId] = useState("");
  const [state, setState] = useState<AuthState>(INITIAL_AUTH_STATE);
  const authGenerationRef = useRef(0);
  const callbackStartedRef = useRef(false);
  const isOAuthCallbackRef = useRef(
    window.location.pathname === "/auth/callback"
      && (new URLSearchParams(window.location.search).has("code")
        || new URLSearchParams(window.location.search).has("error")),
  );

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
    if (isOAuthCallbackRef.current) return;
    const generation = ++authGenerationRef.current;

    const checkAuth = async () => {
      try {
        const user = await validateCurrentSession();
        if (generation !== authGenerationRef.current) return;
        setState({
          isLoading: false,
          isAuthed: true,
          user,
          error: null,
        });
      } catch (err) {
        if (generation !== authGenerationRef.current) return;
        console.error("Auth check failed:", err);
        localStorage.removeItem("discord_user");
        setState({
          isLoading: false,
          isAuthed: false,
          user: null,
          error: err instanceof Error ? err.message : "Unable to validate your session. Please retry.",
        });
      }
    };

    checkAuth();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError = params.get("error");

      if (!isOAuthCallbackRef.current || callbackStartedRef.current) return;
      callbackStartedRef.current = true;
      const generation = ++authGenerationRef.current;

      if (oauthError || !code) {
        window.history.replaceState({}, document.title, getRequestedPath());
        setState({
          isLoading: false,
          isAuthed: false,
          user: null,
          error: oauthError
            ? "Discord sign-in was cancelled or denied. Please try again."
            : "Discord did not return a valid authorization code. Please try again.",
        });
        return;
      }

      const returnedState = params.get("state");
      const expectedState = sessionStorage.getItem(DISCORD_OAUTH_STATE_KEY);
      sessionStorage.removeItem(DISCORD_OAUTH_STATE_KEY);
      if (!returnedState || !expectedState || returnedState !== expectedState) {
        window.history.replaceState({}, document.title, getRequestedPath());
        setState({
          isLoading: false,
          isAuthed: false,
          user: null,
          error: "Invalid Discord login state. Please try again.",
        });
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

        const exchangePayload = await response.json().catch(() => null) as { ok?: boolean; error?: { message?: string } } | null;
        if (!exchangePayload?.ok) {
          throw new Error(exchangePayload?.error?.message || "OAuth exchange failed");
        }

        await validateCurrentSession();
        if (generation !== authGenerationRef.current) return;

        const requestedPath = getRequestedPath();
        sessionStorage.removeItem(DISCORD_REQUESTED_PATH_KEY);
        window.location.replace(requestedPath);
      } catch (err) {
        if (generation !== authGenerationRef.current) return;
        console.error("OAuth callback failed:", err);
        window.history.replaceState({}, document.title, getRequestedPath());
        setState({
          isLoading: false,
          isAuthed: false,
          user: null,
          error: err instanceof Error ? err.message : "OAuth failed",
        });
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
        const requestedPath = window.location.pathname === "/auth/callback"
          ? getRequestedPath()
          : `${window.location.pathname}${window.location.search}${window.location.hash}`;
        sessionStorage.setItem(DISCORD_REQUESTED_PATH_KEY, requestedPath);
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

  const retry = () => {
    const generation = ++authGenerationRef.current;
    setState(INITIAL_AUTH_STATE);

    void validateCurrentSession()
      .then((user) => {
        if (generation !== authGenerationRef.current) return;
        setState({ isLoading: false, isAuthed: true, user, error: null });
      })
      .catch((error: unknown) => {
        if (generation !== authGenerationRef.current) return;
        localStorage.removeItem("discord_user");
        setState({
          isLoading: false,
          isAuthed: false,
          user: null,
          error: error instanceof Error ? error.message : "Unable to validate your session. Please retry.",
        });
      });
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
    retry,
    logout,
    hasRole,
  };
}
