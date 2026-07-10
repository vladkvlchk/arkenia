"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { decodeEventLog } from "viem";
import { usePublicClient, useSignMessage } from "wagmi";
import { ImagePlus, X } from "lucide-react";
import {
  AddressChip,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  Field,
  Input,
  inputClasses,
  useToast,
} from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { useWallet } from "@/shared/lib/mock-wallet";
import { useCreateCampaign } from "@/lib/hooks/campaign";
import { campaignV3FactoryAbi } from "@/lib/abi/campaignV3Factory";
import { activeChain } from "@/lib/config";
import { api, ApiError, buildMetadataMessage } from "@/lib/api/client";
import { API_ENABLED, TOKEN_ADDRESS, TOKEN_SYMBOL } from "@/shared/config";

// V3 creation is deliberately minimal: a campaign is (angel, token) + display metadata.
const WHAT_HAPPENS = [
  { title: "A campaign contract is deployed", body: "You become its angel — the only account able to deploy pooled capital and post returns." },
  { title: "Believers deposit into a shared pool", body: "Deposits stay refundable 1:1 until you deploy them. You never custody un-deployed funds." },
  { title: "Each deployment mints a cohort", body: "Depositors receive pro-rata shares; every return you post is distributed by the contract." },
];

export default function CreatePage() {
  const wallet = useWallet();
  const { toast } = useToast();
  const router = useRouter();
  const { createCampaign } = useCreateCampaign();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const connected = wallet.status === "connected";
  const valid = connected && name.trim().length >= 3;

  function onCoverChange(file?: File) {
    if (!file) return;
    setCover(URL.createObjectURL(file));
  }

  /**
   * Persist the angel-signed name/description off-chain. Best-effort: the campaign exists on-chain
   * regardless, and the indexer can lag the create tx by a few seconds (retry on unknown_campaign).
   */
  async function persistMetadata(
    campaign: `0x${string}`,
    metaName: string,
    metaDescription: string,
    issuedAt: string,
    signature: `0x${string}`
  ) {
    for (let i = 0; i < 8; i++) {
      try {
        await api.putMetadata(campaign, { name: metaName, description: metaDescription, issuedAt, signature });
        queryClient.invalidateQueries({ queryKey: ["v3", "metadata", campaign.toLowerCase()] });
        queryClient.invalidateQueries({ queryKey: ["v3", "campaigns"] });
        return;
      } catch (e) {
        if (e instanceof ApiError && e.code === "unknown_campaign" && i < 7) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        return; // give up silently — the campaign is live, only the name isn't stored
      }
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const txHash = await createCampaign(TOKEN_ADDRESS as `0x${string}`);
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });
      // Pull the new clone address out of the factory's CampaignCreated event.
      let newAddr: `0x${string}` | undefined;
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = decodeEventLog({ abi: campaignV3FactoryAbi, data: log.data, topics: log.topics });
          if (parsed.eventName === "CampaignCreated") {
            newAddr = (parsed.args as { campaign: `0x${string}` }).campaign;
            break;
          }
        } catch {
          /* not a factory event */
        }
      }
      // Persist the name/description off-chain (angel-signed). The signature prompt is quick; the
      // PUT itself retries in the background while the indexer catches up to the new campaign.
      if (newAddr && API_ENABLED) {
        try {
          const metaName = name.trim();
          const metaDescription = description.trim();
          const issuedAt = new Date().toISOString();
          const message = buildMetadataMessage(activeChain.id, newAddr, metaName, metaDescription, issuedAt);
          const signature = await signMessageAsync({ message });
          void persistMetadata(newAddr, metaName, metaDescription, issuedAt, signature);
        } catch {
          /* user declined the signature — the campaign is live, its name just isn't stored yet */
        }
      }
      toast({
        title: "Campaign created",
        description: name ? `"${name}" is live.` : "Your campaign is live.",
        intent: "success",
        txHash,
      });
      router.push(newAddr ? `/campaign/${newAddr}` : "/campaigns");
    } catch (e) {
      toast({
        title: "Creation failed",
        description: e instanceof Error ? e.message : "The transaction was rejected.",
        intent: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container className="py-10">
      <div className="mx-auto grid max-w-4xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Create a campaign</CardTitle>
            <CardDescription>
              Three fields. Everything else — cohorts, shares, returns — is handled by the contract.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-5">
            <Field label="Campaign name" htmlFor="campaign-name" hint="Public. Shown on cards, your profile and the explorer metadata.">
              <Input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Atlas Deep Compute"
                maxLength={64}
              />
            </Field>

            <Field
              label="Description"
              htmlFor="campaign-desc"
              hint="Public. One sentence on what believers are backing. Persists once the metadata service is live."
            >
              <textarea
                id="campaign-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={280}
                placeholder="e.g. Distributed GPU cycles for open model training."
                className={cn(inputClasses, "h-auto resize-none py-2 leading-5")}
              />
            </Field>

            <Field
              label="Fundraising token"
              hint="Fixed for this deployment — believers deposit and returns settle in this token."
            >
              <div className="flex h-11 items-center justify-between rounded-md border border-line bg-surface-2/60 px-3">
                <span className="font-mono text-sm text-ink">{TOKEN_SYMBOL}</span>
                <AddressChip address={TOKEN_ADDRESS} variant="plain" />
              </div>
            </Field>

            <Field label="Cover image" hint="Optional. 3:1 works best; campaigns without one get a monogram tile.">
              {cover ? (
                <div className="relative overflow-hidden rounded-md border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover} alt="Cover preview" className="aspect-[3/1] w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove cover image"
                    onClick={() => setCover(null)}
                    className="absolute right-2 top-2 rounded-md border border-line bg-surface/95 p-1.5 text-ink-muted transition-colors duration-150 hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-[3/1] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-ink-subtle transition-colors duration-150 hover:border-ink-faint hover:text-ink-muted"
                >
                  <ImagePlus className="h-5 w-5" aria-hidden />
                  <span className="text-[13px]">Upload cover</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onCoverChange(e.target.files?.[0])}
              />
            </Field>

            {connected ? (
              <Button className="w-full" size="lg" disabled={!valid} loading={submitting} onClick={submit}>
                Create campaign
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={wallet.connect}
                loading={wallet.status === "connecting"}
              >
                Connect wallet to create
              </Button>
            )}
            <p className="text-xs leading-5 text-ink-subtle">
              Creating a campaign costs only gas. Arkenia takes no fee and holds no admin keys over
              your campaign.
            </p>
          </CardBody>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <div>
            <div className="t-overline">What happens when you create</div>
            <ol className="mt-4 space-y-4">
              {WHAT_HAPPENS.map((item, i) => (
                <li key={item.title} className="flex gap-3">
                  <span className="font-mono text-xs text-ink-faint">0{i + 1}</span>
                  <div>
                    <div className="text-[13px] font-medium leading-5 text-ink">{item.title}</div>
                    <p className="mt-0.5 text-xs leading-5 text-ink-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Container>
  );
}
