"use client";

import { useState } from "react";
import { Droplets } from "lucide-react";
import {
  AddressChip,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  TokenAmount,
} from "@/shared/ui";
import { useToast } from "@/shared/ui";
import { useWallet } from "@/shared/lib/mock-wallet";
import { useTokenActions } from "@/lib/hooks/campaign";
import { fmtNum } from "@/shared/lib/format";
import { CHAIN_NAME, TOKEN_ADDRESS, TOKEN_SYMBOL } from "@/shared/config";

const FAUCET_AMOUNT = 10000;

export default function FaucetPage() {
  const wallet = useWallet();
  const { toast } = useToast();
  const { faucet } = useTokenActions();
  const [requesting, setRequesting] = useState(false);

  const connected = wallet.status === "connected";

  async function request() {
    setRequesting(true);
    try {
      const txHash = await faucet();
      toast({
        title: `${fmtNum(FAUCET_AMOUNT)} ${TOKEN_SYMBOL} minted`,
        description: "Test funds are in your wallet. They have no value outside this testnet.",
        intent: "success",
        txHash,
      });
    } catch (e) {
      toast({
        title: "Faucet request failed",
        description: e instanceof Error ? e.message : "The transaction was rejected.",
        intent: "danger",
      });
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Faucet</CardTitle>
              <Badge variant="warning">Testnet</Badge>
            </div>
            <CardDescription>
              Mints test {TOKEN_SYMBOL} on {CHAIN_NAME} so you can try every flow with valueless
              funds.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="flex items-center justify-between rounded-md border border-line bg-surface-2/60 px-4 py-3.5">
              <span className="text-[13px] text-ink-muted">Per request</span>
              <TokenAmount value={FAUCET_AMOUNT} precision={0} className="text-lg font-medium" />
            </div>

            <div className="space-y-1.5">
              <div className="t-overline">Recipient</div>
              {connected && wallet.address ? (
                <AddressChip address={wallet.address} />
              ) : (
                <p className="text-[13px] text-ink-muted">Connect a wallet to receive test funds.</p>
              )}
            </div>

            {connected ? (
              <Button className="w-full" size="lg" loading={requesting} onClick={request}>
                <Droplets className="h-4 w-4" aria-hidden />
                Request {fmtNum(FAUCET_AMOUNT)} {TOKEN_SYMBOL}
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={wallet.connect}
                loading={wallet.status === "connecting"}
              >
                Connect wallet
              </Button>
            )}

            <div className="space-y-1.5 border-t border-line pt-4">
              <div className="t-overline">Token contract</div>
              <AddressChip address={TOKEN_ADDRESS} />
              <p className="text-xs leading-5 text-ink-subtle">
                Add it to your wallet with this address to see your balance. The faucet is unmetered
                on this testnet — request as often as you need.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
