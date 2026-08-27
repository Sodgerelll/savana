// Auto-reply to comments on Facebook and Instagram posts.
//
// On a shop page most comments are one of a handful of questions — price,
// availability, delivery — asked publicly under a product photo. Answering them
// publicly is what other readers see, so the public reply stays short and the
// detail goes into a private Messenger reply.
//
// Meta permits exactly ONE private reply per comment, so this must be
// idempotent per comment id or a retry burns the single chance.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { buildStorefrontPrompt, type StorefrontContext } from './buildPrompt.js';
import { callGemini, looksLikeOurOwnInstructions } from './gemini.js';
import {
  getPostContext,
  getRecentPosts,
  replyToComment,
  sendPrivateReply,
} from './facebook.js';
import { markEventProcessed } from './guards.js';

export const COMMENT_LOG_COLLECTION = 'chat_comment_replies';

/** Public replies stay short — they sit under a post for everyone to read. */
const PUBLIC_REPLY_MAX_TOKENS = 120;
const MAX_COMMENT_LENGTH = 500;

const PUBLIC_REPLY_RULES = `
# ЭНЭ БОЛ ПОСТЫН СЭТГЭГДЭЛД ӨГӨХ НИЙТИЙН ХАРИУ
- **1-2 богино өгүүлбэр.** Бүх хүн уншина.
- Үнэ асуувал ҮНИЙГ нь шууд хэл. Тойрч "инбокс бичнэ үү" гэж бүү хэл.
- Дэлгэрэнгүй шаардвал төгсгөлд нь "Дэлгэрэнгүйг мессежээр илгээлээ 📩" гэж нэм.
- Мэндчилгээ бүү бич — сэтгэгдэлд шууд хариул.
- Емоди 1-ээс ихгүй.`;

export interface CommentEvent {
  commentId: string;
  postId: string;
  authorId: string;
  authorName: string;
  message: string;
  channel: 'facebook' | 'instagram';
}

/**
 * Pulls a comment event out of the webhook `changes` entry.
 * Returns null for anything that is not a new top-level comment from someone
 * other than the page itself.
 */
export function parseCommentChange(
  change: any,
  pageId: string,
  channel: 'facebook' | 'instagram',
): CommentEvent | null {
  const value = change?.value;
  if (!value) {
    return null;
  }

  // Facebook feed changes cover likes, shares and edits too.
  if (channel === 'facebook') {
    if (value.item !== 'comment' || value.verb !== 'add') {
      return null;
    }
  }

  const commentId = String(value.comment_id ?? value.id ?? '');
  const message = String(value.message ?? value.text ?? '').trim();
  const authorId = String(value.from?.id ?? '');

  if (!commentId || !message) {
    return null;
  }

  // Our own replies come back through the same webhook; answering them loops.
  if (authorId && authorId === pageId) {
    return null;
  }

  return {
    commentId,
    postId: String(value.post_id ?? value.media?.id ?? ''),
    authorId,
    authorName: String(value.from?.name ?? value.from?.username ?? ''),
    message: message.slice(0, MAX_COMMENT_LENGTH),
    channel,
  };
}

/**
 * Answers one comment publicly, then opens a Messenger thread with the same
 * answer so the conversation can continue privately.
 *
 * Every failure is contained: a comment we cannot answer must never take down
 * the rest of the webhook batch.
 */
export async function handleCommentEvent(
  db: any,
  event: CommentEvent,
  options: {
    token: string;
    storefront: StorefrontContext;
    model?: string;
    temperature?: number;
  },
): Promise<boolean> {
  // One claim per comment id — Meta allows a single private reply, so a
  // duplicate delivery must not consume it.
  if (!(await markEventProcessed(db, `comment_${event.commentId}`))) {
    return false;
  }

  const context = { ...options.storefront, posts: await getRecentPosts(options.token) };
  const systemPrompt = `${buildStorefrontPrompt(context, new Date())}\n${PUBLIC_REPLY_RULES}`;

  // A comment is half a sentence. "Энэ хэдэн вэ?" names no product because the
  // customer already named it by commenting where they did, and without the
  // post the bot is guessing between forty-six of them.
  //
  // It goes in the message rather than the system prompt on purpose. Quoting
  // the shop's own public post back is a perfectly good answer, and the leak
  // guard below would read that as the model reciting its instructions and
  // throw the reply away.
  const postText = await getPostContext(options.token, event.postId, event.channel);
  const message = postText
    ? `Хэрэглэгч энэ постын доор сэтгэгдэл бичлээ.\n\nПОСТ: ${postText}\n\nСЭТГЭГДЭЛ: ${event.message}`
    : event.message;

  let reply: string;
  try {
    reply = await callGemini({
      systemPrompt,
      message,
      model: options.model,
      temperature: options.temperature,
      maxOutputTokens: PUBLIC_REPLY_MAX_TOKENS,
    });
  } catch (err) {
    console.error('[chat/comments] generation failed:', (err as Error).message);
    return false;
  }

  // Saying nothing beats saying the wrong thing here. A comment reply sits on a
  // public post, where an echoed instruction is visible to everyone who sees
  // the post and stays visible; the comment is left for a person instead.
  if (looksLikeOurOwnInstructions(reply, [systemPrompt])) {
    console.error('[chat/comments] model echoed its own instructions; nothing posted');
    return false;
  }

  const publicOk = await replyToComment(options.token, event.commentId, reply);
  // Best-effort: the private reply fails on comments older than 7 days, and on
  // Instagram when the commenter has never messaged the account.
  const privateOk = await sendPrivateReply(options.token, event.commentId, reply);

  await logCommentReply(db, event, reply, { publicOk, privateOk });

  return publicOk || privateOk;
}

/** Admin-visible record of what the bot said publicly, and whether it landed. */
async function logCommentReply(
  db: any,
  event: CommentEvent,
  reply: string,
  result: { publicOk: boolean; privateOk: boolean },
): Promise<void> {
  try {
    await db.collection(COMMENT_LOG_COLLECTION).doc(event.commentId).set({
      commentId: event.commentId,
      postId: event.postId,
      channel: event.channel,
      authorName: event.authorName,
      comment: event.message,
      reply,
      publicReplySent: result.publicOk,
      privateReplySent: result.privateOk,
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn('[chat/comments] log failed:', (err as Error).message);
  }
}
