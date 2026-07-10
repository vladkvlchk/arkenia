"use client";

/**
 * React-query reads against the V3 backend. All are gated on API_ENABLED (testnet contour) and
 * fail soft: consumers fall back to on-chain reads / empty states when the backend is unreachable.
 */
import { useQuery } from "@tanstack/react-query";
import { API_ENABLED } from "@/shared/config";
import { api } from "../api/client";

type Addr = `0x${string}`;
const STALE = 10_000;

export function useApiCampaigns() {
  return useQuery({
    queryKey: ["v3", "campaigns"],
    queryFn: () => api.listCampaigns(),
    enabled: API_ENABLED,
    staleTime: STALE,
    retry: 1,
  });
}

export function useApiCampaignMetadata(address?: Addr) {
  return useQuery({
    queryKey: ["v3", "metadata", address?.toLowerCase()],
    queryFn: () => api.metadata(address as Addr),
    enabled: API_ENABLED && !!address,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useApiCampaignActivity(address?: Addr, limit = 50) {
  return useQuery({
    queryKey: ["v3", "activity", address?.toLowerCase(), limit],
    queryFn: () => api.campaignActivity(address as Addr, limit),
    enabled: API_ENABLED && !!address,
    staleTime: STALE,
    retry: 1,
  });
}

export function useApiAccountPositions(address?: Addr) {
  return useQuery({
    queryKey: ["v3", "positions", address?.toLowerCase()],
    queryFn: () => api.accountPositions(address as Addr),
    enabled: API_ENABLED && !!address,
    staleTime: STALE,
    retry: 1,
  });
}

export function useApiAccountActivity(address?: Addr, limit = 50) {
  return useQuery({
    queryKey: ["v3", "account-activity", address?.toLowerCase(), limit],
    queryFn: () => api.accountActivity(address as Addr, limit),
    enabled: API_ENABLED && !!address,
    staleTime: STALE,
    retry: 1,
  });
}

export function useApiOrderBook(address?: Addr, cohort?: number) {
  return useQuery({
    queryKey: ["v3", "orderbook", address?.toLowerCase(), cohort],
    queryFn: () => api.orderBook(address as Addr, cohort),
    enabled: API_ENABLED && !!address,
    staleTime: STALE,
    retry: 1,
  });
}
