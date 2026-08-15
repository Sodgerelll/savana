# Firebase дээр хийх ажил — AI Chat

> Энэ 3 зүйлийг **Firebase Console дээрээс** хийнэ. CLI, терминал, локал орчин
> хэрэггүй. Firestore-д **Editor** эрхтэй хүн 10 минутад дуусгана.
>
> Код аль хэдийн production-д гарсан (GitHub `main`). Энэ 3 алхам дуустал
> админ панелын **AI Chat** хэсэг "permission denied" өгнө. Хэрэглэгчид ямар ч
> нөлөө байхгүй — бот болон виджет хоёулаа унтраалттай.

Project: **savana-3f45a**

---

## 1. Firestore Rules

Console → **Firestore Database** → **Rules** таб.

⚠️ Байгаа дүрмийг **бүү устга.** Зөвхөн доорхыг НЭМНЭ. Юу ч дарж бичихгүй.

### 1а. Хоёр helper функц

Одоо байгаа `function isOrderOwner()` -ийн **яг доор** дараахыг тавина:

```
    function isChatConversationOwner() {
      return isSignedIn()
        && resource.data.userId != null
        && resource.data.userId == request.auth.uid;
    }

    function isChatMessageOwner(conversationId) {
      return isSignedIn()
        && exists(/databases/$(database)/documents/chat_conversations/$(conversationId))
        && get(/databases/$(database)/documents/chat_conversations/$(conversationId)).data.userId != null
        && get(/databases/$(database)/documents/chat_conversations/$(conversationId)).data.userId == request.auth.uid;
    }
```

### 1б. Чатын дүрмийн блок

`match /users/{userId} {` мөрийн **яг дээр** дараахыг тавина:

```
    // ─── AI Chat ──────────────────────────────────────────────────────────────
    // Every chat write happens server-side through the Admin SDK (api/chat/*),
    // which bypasses these rules entirely. Clients therefore only ever read —
    // the browser never creates a conversation, message or lead, so there is no
    // anonymous write surface to forge a "paid" lead or a fake admin reply on.

    // Holds the Facebook Page Access Token — readable by admins only, never public.
    match /chat_settings/{documentId} {
      allow read: if hasPrivilegedProfileRole();
      allow create, update: if hasPrivilegedProfileRole();
      allow delete: if false;
    }

    // Knowledge base. The bot reads it server-side, so no public read is needed.
    match /chat_faqs/{faqId} {
      allow read, list: if hasPrivilegedProfileRole();
      allow create, update, delete: if hasPrivilegedProfileRole();
    }

    match /chat_conversations/{conversationId} {
      allow get: if hasPrivilegedProfileRole() || isChatConversationOwner();
      allow list: if hasPrivilegedProfileRole();
      allow write: if false;

      match /messages/{messageId} {
        allow read, list: if hasPrivilegedProfileRole()
          || isChatMessageOwner(conversationId);
        allow write: if false;
      }
    }

    // Chat-captured requests, before an admin turns one into an order.
    match /chat_leads/{leadId} {
      allow read, list: if hasPrivilegedProfileRole();
      allow update, delete: if hasPrivilegedProfileRole();
      allow create: if false;
    }

    // What the bot replied publicly under a page post, and whether each reply
    // landed. Written by the webhook through the Admin SDK; admins read it to
    // audit what was said in public on their behalf.
    match /chat_comment_replies/{commentId} {
      allow read, list: if hasPrivilegedProfileRole();
      allow write: if false;
    }

    // Webhook de-duplication and rate-limit counters — server-only bookkeeping.
    // Both grow without bound, so each needs a Firestore TTL policy on `expireAt`.
    match /chat_processed_events/{eventId} {
      allow read, write: if false;
    }

    match /chat_rate_limits/{rateLimitId} {
      allow read, write: if false;
    }
```

**Publish** дарна. Дуусмагц Console дээр шинэ хувилбар үүснэ — буруудвал
Rules → History-оос нэг товшилтоор буцаана.

---

## 2. Индекс — 6 ширхэг

Console → **Firestore Database** → **Indexes** таб → **Composite** →
**Create index**.

Collection ID-г **гараар бичнэ** (жагсаалтад байхгүй, учир нь collection хараахан
үүсээгүй). Query scope нь бүгдэд **Collection**.

| # | Collection ID | Талбар 1 | Талбар 2 |
|---|---|---|---|
| 1 | `chat_conversations` | `channel` Ascending | `externalUserId` Ascending |
| 2 | `chat_conversations` | `channel` Ascending | `lastMessageAt` Descending |
| 3 | `chat_conversations` | `status` Ascending | `lastMessageAt` Descending |
| 4 | `chat_leads` | `status` Ascending | `createdAt` Descending |
| 5 | `chat_leads` | `type` Ascending | `createdAt` Descending |
| 6 | `chat_faqs` | `isActive` Ascending | `order` Ascending |

Индекс үүсэхэд хэдэн минут болно ("Building" → "Enabled").

---

## 3. TTL policy — 2 ширхэг

Console → **Firestore Database** → **TTL** таб → **Create policy**.

| Collection ID | Timestamp field |
|---|---|
| `chat_processed_events` | `expireAt` |
| `chat_rate_limits` | `expireAt` |

Эдгээр нь webhook-ийн дотоод тэмдэглэл. TTL-гүй бол **хязгааргүй өснө** —
заавал хийнэ.

---

## Дуусахад шалгах

Админ панел → **AI Chat → Хяналт** нээгдэж, статистик харагдвал бүгд зөв.

## Юу НЭМЖ хийх шаардлагагүй вэ

- Өгөгдөл устгах / хөдөлгөх — **хэрэггүй**. Дээрх 3 алхам нэг ч документ хөндөхгүй.
- Байгаа collection, rules, индексийг өөрчлөх — **хэрэггүй**.
- Firebase Functions deploy — **хэрэггүй**. Бүх backend Vercel дээр.
