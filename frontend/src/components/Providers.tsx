"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig, activeChain } from "@/lib/config";

// Polls on-chain reads so the UI reflects state a few seconds after any action.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchInterval: 10_000, staleTime: 5_000 } },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        defaultChain: activeChain,
        supportedChains: [activeChain],
        loginMethods: ["wallet"],
        appearance: {
          theme: "light",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
