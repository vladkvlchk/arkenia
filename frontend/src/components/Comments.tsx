"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { API_URL, AUTH_URL } from "@/lib/config";

interface Comment {
  id: number;
  campaign: string;
  parent_id: number | null;
  author: string;
  content: string;
  created_at: string;
}

interface CommentNode extends Comment {
  replies: CommentNode[];
}

interface AuthorProfile {
  twitterUsername?: string;
  twitterAvatar?: string;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function buildTree(comments: Comment[]): CommentNode[] {
  const map = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];

  for (const c of comments) {
    map.set(c.id, { ...c, replies: [] });
  }

  for (const c of comments) {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  // Top-level newest first, replies oldest first (already ASC from API)
  roots.reverse();
  return roots;
}

function CommentForm({
  onSubmit,
  placeholder,
  autoFocus,
}: {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content.trim());
      setContent("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder || "Write a comment..."}
        autoFocus={autoFocus}
        rows={2}
        maxLength={2000}
        className="flex-1 rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-gray-900 resize-none"
      />
      <button
        type="submit"
        disabled={!content.trim() || submitting}
        className="self-end rounded-lg bg-gray-900 px-4 py-2 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {submitting ? "..." : "Post"}
      </button>
    </form>
  );
}

function AuthorDisplay({
  author,
  profiles,
}: {
  author: string;
  profiles: Map<string, AuthorProfile>;
}) {
  const profile = profiles.get(author);
  return (
    <Link
      href={`/profile/${author}`}
      className="text-gray-600 hover:text-gray-900 hover:underline text-sm font-medium flex items-center gap-1.5"
    >
      {profile?.twitterAvatar && (
        <img src={profile.twitterAvatar} alt="" className="w-4 h-4 rounded-full" />
      )}
      <span className={profile?.twitterUsername ? "" : "font-mono"}>
        {profile?.twitterUsername ? `@${profile.twitterUsername}` : shortAddr(author)}
      </span>
    </Link>
  );
}

function CommentItem({
  comment,
  onReply,
  isReply,
  canComment,
  profiles,
}: {
  comment: CommentNode;
  onReply: (parentId: number, content: string) => Promise<void>;
  isReply?: boolean;
  canComment: boolean;
  profiles: Map<string, AuthorProfile>;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);

  async function handleReply(content: string) {
    // Replies to replies target the top-level parent
    const parentId = comment.parent_id ?? comment.id;
    await onReply(parentId, content);
    setShowReplyForm(false);
  }

  return (
    <div className={isReply ? "ml-8 border-l border-gray-200 pl-4" : ""}>
      <div className="py-3">
        <div className="flex items-center gap-2 mb-1">
          <AuthorDisplay author={comment.author} profiles={profiles} />
          <span className="text-gray-400 text-xs">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="text-gray-600 text-sm whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        {canComment && !isReply && (
          <button
            onClick={() => setShowReplyForm(!showReplyForm)}
            className="text-gray-400 hover:text-gray-600 text-xs mt-1 transition"
          >
            {showReplyForm ? "Cancel" : "Reply"}
          </button>
        )}
        {showReplyForm && (
          <div className="mt-2">
            <CommentForm
              onSubmit={handleReply}
              placeholder="Write a reply..."
              autoFocus
            />
          </div>
        )}
      </div>

      {comment.replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          onReply={onReply}
          isReply
          canComment={canComment}
          profiles={profiles}
        />
      ))}
    </div>
  );
}

export function Comments({ campaignAddress }: { campaignAddress: string }) {
  const { address } = useAccount();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [twitterLinked, setTwitterLinked] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [profiles, setProfiles] = useState<Map<string, AuthorProfile>>(new Map());

  // Check if current user has Twitter linked
  useEffect(() => {
    if (!address) {
      setTwitterLinked(false);
      return;
    }
    setCheckingProfile(true);
    fetch(`${API_URL}/api/auth/profile/${address}`)
      .then((r) => r.json())
      .then((data) => setTwitterLinked(data.linked === true))
      .catch(() => setTwitterLinked(false))
      .finally(() => setCheckingProfile(false));
  }, [address]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/comments/${campaignAddress}`);
      if (res.ok) {
        const data: Comment[] = await res.json();
        setComments(data);

        // Fetch profiles for all unique authors
        const authors = [...new Set(data.map((c) => c.author))];
        const profileMap = new Map<string, AuthorProfile>();
        await Promise.all(
          authors.map(async (author) => {
            try {
              const r = await fetch(`${API_URL}/api/auth/profile/${author}`);
              const p = await r.json();
              if (p.linked) {
                profileMap.set(author, {
                  twitterUsername: p.twitterUsername,
                  twitterAvatar: p.twitterAvatar,
                });
              }
            } catch {
              // ignore
            }
          })
        );
        setProfiles(profileMap);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [campaignAddress]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const canComment = !!address && twitterLinked;

  async function postComment(content: string, parentId?: number) {
    const res = await fetch(`${API_URL}/api/comments/${campaignAddress}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: address, content, parentId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Failed to post comment (${res.status})`);
    }
    const newComment: Comment = await res.json();
    setComments((prev) => [...prev, newComment]);

    // Add current user's profile to map if not there
    if (address && !profiles.has(address.toLowerCase())) {
      try {
        const r = await fetch(`${API_URL}/api/auth/profile/${address}`);
        const p = await r.json();
        if (p.linked) {
          setProfiles((prev) => {
            const next = new Map(prev);
            next.set(address.toLowerCase(), {
              twitterUsername: p.twitterUsername,
              twitterAvatar: p.twitterAvatar,
            });
            return next;
          });
        }
      } catch {
        // ignore
      }
    }
  }

  async function handleTopLevel(content: string) {
    await postComment(content);
  }

  async function handleReply(parentId: number, content: string) {
    await postComment(content, parentId);
  }

  const tree = buildTree(comments);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </h3>

      {canComment ? (
        <div className="mb-4">
          <CommentForm onSubmit={handleTopLevel} />
        </div>
      ) : address && !checkingProfile && !twitterLinked ? (
        <div className="mb-4 rounded-lg bg-gray-100 p-3 text-sm">
          <span className="text-gray-500">
            Connect Twitter to comment.{" "}
          </span>
          <Link
            href={`/profile/${address}`}
            className="text-gray-600 hover:text-gray-900 hover:underline"
          >
            Go to your profile
          </Link>
        </div>
      ) : null}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading comments...</p>
      ) : tree.length === 0 ? (
        <p className="text-gray-400 text-sm">No comments yet. Be the first!</p>
      ) : (
        <div className="divide-y divide-gray-200">
          {tree.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={handleReply}
              canComment={canComment}
              profiles={profiles}
            />
          ))}
        </div>
      )}
    </div>
  );
}
