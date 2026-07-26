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

// Cover-storage failures we recover from by saving the name alone (the image is optional).
const COVER_SOFT_FAILURES = new Set(["storage_unconfigured", "unsupported_cover_type", "cover_too_large"]);

/** Human-readable reason for a failed metadata write, keyed by the backend error code. */
function metadataErrorMessage(code: string): string {
  switch (code) {
    case "not_angel":
      return "The signature didn't match the campaign's angel wallet — save from the wallet that created it.";
    case "stale_auth":
      return "The signing window expired — the campaign is live, but its name wasn't saved.";
    case "invalid_metadata":
      return "The name or description was rejected — check the length and try again.";
    case "unknown_campaign":
      return "The indexer hasn't picked up the campaign yet — it's live on-chain, but its name wasn't saved.";
    case "network_error":
      return "Couldn't reach the metadata service — the campaign is live on-chain, but its name wasn't saved.";
    default:
      return "The campaign is live on-chain, but its name/cover weren't saved.";
  }
}

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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const connected = wallet.status === "connected";
  const valid = connected && name.trim().length >= 3;

  function onCoverChange(file?: File) {
    if (!file) return;
    setCoverFile(file); // keep the actual File — it's what gets uploaded
    setCover(URL.createObjectURL(file)); // object URL is preview-only
  }

  /**
   * Persist the angel-signed name/description (+ optional cover) off-chain. Robust by design:
   *  - the indexer can lag the create tx by tens of seconds, so `unknown_campaign` is retried over
   *    a generous window (the write can't be verified until the campaign is indexed);
   *  - a cover-storage problem falls back to saving the name alone rather than losing both;
   *  - every terminal outcome is surfaced via a toast — no more silent drops.
   * Runs to completion across the post-create navigation (toasts are app-level).
   */
  async function persistMetadata(
    campaign: `0x${string}`,
    metaName: string,
    metaDescription: string,
    issuedAt: string,
    signature: `0x${string}`,
    file: File | null
  ) {
    const RETRY_WINDOW_MS = 120_000;
    const startedAt = Date.now();
    let dropCover = false;
    let lastCode = "network_error";

    for (let attempt = 0; attempt < 64; attempt++) {
      try {
        await api.putMetadata(
          campaign,
          { name: metaName, description: metaDescription, issuedAt, signature },
          dropCover ? undefined : file ?? undefined
        );
        queryClient.invalidateQueries({ queryKey: ["v3", "metadata", campaign.toLowerCase()] });
        queryClient.invalidateQueries({ queryKey: ["v3", "campaigns"] });
        toast(
          dropCover
            ? {
                title: "Name saved — cover skipped",
                description: "The name is live; the cover image couldn't be stored.",
                intent: "info",
              }
            : { title: "Campaign details saved", intent: "success" }
        );
        return;
      } catch (e) {
        lastCode = e instanceof ApiError ? e.code : "network_error";
        // A cover-only failure shouldn't cost the name — retry once without the image.
        if (!dropCover && file && COVER_SOFT_FAILURES.has(lastCode)) {
          dropCover = true;
          continue;
        }
        // Indexer hasn't caught up to the new campaign yet — keep trying within the window.
        if (lastCode === "unknown_campaign" && Date.now() - startedAt < RETRY_WINDOW_MS) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        toast({ title: "Couldn't save campaign details", description: metadataErrorMessage(lastCode), intent: "danger" });
        return;
      }
    }
    toast({ title: "Couldn't save campaign details", description: metadataErrorMessage(lastCode), intent: "danger" });
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
          // Detached on purpose: it retries past the indexer lag and toasts its own outcome.
          void persistMetadata(newAddr, metaName, metaDescription, issuedAt, signature, coverFile);
        } catch {
          toast({
            title: "Name not saved",
            description:
              "You declined the signature, so the campaign is live on-chain but has no name yet.",
            intent: "info",
          });
        }
      }
      toast({
        title: "Campaign created",
        description:
          newAddr && API_ENABLED ? "Live on-chain — saving name & cover…" : "Your campaign is live on-chain.",
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
                    onClick={() => {
                      setCover(null);
                      setCoverFile(null);
                    }}
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
