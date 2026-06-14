import { useState } from "react";
import { createMatchNight, getMatchNightById } from "../api/client";
import type { MatchNightCreateInput, MatchNightDoc } from "../types/contracts";

export function useMatchNightApi() {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveMatchNight = async (payload: MatchNightCreateInput): Promise<MatchNightDoc | null> => {
    setIsSaving(true);
    setError(null);
    try {
      return await createMatchNight(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save match night");
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const loadMatchNight = async (id: string, teamId: string): Promise<MatchNightDoc | null> => {
    setIsLoading(true);
    setError(null);
    try {
      return await getMatchNightById(id, teamId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load match night");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isSaving,
    isLoading,
    error,
    saveMatchNight,
    loadMatchNight,
  };
}
