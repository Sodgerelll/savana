# SAVANA AI Chat

Facebook Messenger, Instagram Direct болон вэбсайтын виджет дээр ажиллах AI туслах.
Бүх 6 фаз хэрэгжсэн.

Эх сурвалж: `tegri-admin-front` (GitLab `tegri/tegri-admin-front`). AI цөм, найдвартай
байдлын механизм, production-оос гарсан prompt дүрмүүдийг тэндээс авсан; домэйн (асаргаа,
цаг товлолт, QPay) хэсгийг SAVANA-гийн каталог, борлуулалт, Bonum-аар сольсон.

## Архитектур

```
Facebook Messenger ─┐
Instagram Direct   ─┼─→ /api/chat/webhook ──┐
savana.mn виджет   ─┴─→ /api/chat/widget  ──┤
                                            ├─→ buildPrompt (SAVANA каталог)
Админ тест чат ────────→ /api/chat/assistant┘        ↓
Админы хариу ──────────→ /api/chat/reply         Gemini (function calling)
FB цэс суулгах ────────→ /api/chat/setup              ↓
                                              Firestore: chat_conversations
                                                       ↓
                                              Админ → AI Chat
```

**Бүх чатын бичилт server-side Admin SDK-аар хийгдэнэ.** `firestore.rules` дээр клиентээс
`chat_*`-д бичих эрх бүрэн хаалттай — хуурамч lead, хуурамч "админы хариу" үүсгэх гадаргуу
байхгүй.

## Файлууд

| Зам | Үүрэг |
|---|---|
| `api/chat/webhook.ts` | FB + IG event. Verify, DM, postback, handover, lead. |
| `api/chat/widget.ts` | Нийтийн виджет (POST) + тохиргооны GET probe. |
| `api/chat/assistant.ts` | Админы AI (тест чат, FAQ үүсгэгч). |
| `api/chat/reply.ts` | Админы хариу → сувгаар нь буцаана. |
| `api/chat/setup.ts` | FB хуудсанд цэс/мэндчилгээ суулгах, token шалгах. |
| `api/chat/_lib/gemini.ts` | Model fallback chain, retry, function calling. |
| `api/chat/_lib/buildPrompt.ts` | Каталогоос prompt угсарна (60 сек кэш). |
| `api/chat/_lib/tools.ts` | AI-гийн 5 хэрэгсэл. |
| `api/chat/_lib/conversation.ts` | Яриа, мессеж, handover цаг. |
| `api/chat/_lib/facebook.ts` | Send API, carousel, quick reply, persistent menu. |
| `api/chat/_lib/guards.ts` | Idempotency + rate limit. |
| `api/chat/_lib/leads.ts` | Хүсэлт, утас/нэр таних. |
| `api/chat/_lib/auth.ts` | ID token + Firestore role шалгалт. |
| `src/lib/chat/*` | Клиент store: settings, faq, conversation, lead, api. |
| `src/pages/admin/Chat*.tsx` | 5 админ хуудас. |
| `src/components/chat/*` | ChatPanel (админ), ChatWidget (storefront). |

## AI хэрэгслүүд

`show_products` · `show_promotions` · `check_order` · `start_order` · `transfer_to_staff`

Загвар өөрөө шийднэ: чөлөөт бичвэрийг уншаад хэрэгсэл дуудах эсвэл текстээр хариулах.

## Нэмэлт зан төлөв

**Постын сэтгэгдэлд авто хариу.** Тохиргооны `replyToComments` асаавал FB/IG постын
сэтгэгдэлд нийтээр богино хариулаад (1-2 өгүүлбэр, үнийг шууд хэлнэ), мөн Messenger-ээр
хувийн мессеж илгээж яриаг үргэлжлүүлнэ. Meta нэг сэтгэгдэлд **ганц** хувийн хариу
зөвшөөрдөг тул comment id-аар idempotent. Хариултууд `chat_comment_replies`-д логлогдоно.

**Зураг.** Хэрэглэгч зураг илгээвэл татаж аваад Gemini vision-оор хариулна. Хэрэгсэлгүй
ажиллана (vision + function calling найдваргүй хослол). Арьсны зурагт **онош тавихыг
хориглосон** — ерөнхий арчилгааны зөвлөгөө өгөөд ноцтой бол эмчид хандахыг зөвлөнө.
4 MB-аас том эсвэл танихгүй формат бол уншиж чадсангүй гэж хариулна.

**Дуугүй болсонд сануулах.** Захиалга эхлээд утсаа өгөөгүй 20 минут болсон хэрэглэгчид
**нэг л удаа** сануулна. Vercel Hobby cron өдөрт нэг удаа ажилладаг тул урсгалаар
хөтлөгдөнө (webhook орох бүрт, 5 минутад нэгээс илүүгүй). Админ гараа хүргэсэн яриаг
хэзээ ч тасалдуулахгүй. Виджетийн зочинд push боломжгүй тул алгасна.

**Статистик.** Хяналт хуудсанд сүүлийн 7 хоногийн яриа, хүн рүү шилжсэн хувь, хүсэлтийн
хөрвүүлэлт, суваг тус бүрийн тоо. Аль хэдийн урсаж буй өгөгдлөөс тооцдог тул нэмэлт
Firestore унших зардалгүй.

## Firestore

| Collection | Клиент | Сервер |
|---|---|---|
| `chat_settings/main` | read: зөвхөн админ | read/write |
| `chat_faqs` | админ CRUD | read |
| `chat_conversations/{id}/messages` | read: админ, эзэн нь | write |
| `chat_leads` | read/update/delete: админ | create/update |
| `chat_processed_events` | ❌ | write |
| `chat_rate_limits` | ❌ | write |

⚠️ **TTL заавал тохируулна:** Firebase Console → Firestore → TTL →
`chat_processed_events.expireAt` ба `chat_rate_limits.expireAt`. Эс бөгөөс хязгааргүй өснө.

Индексүүд `firestore.indexes.json`-д бий. FAQ query нь индекс байхгүй бол эрэмбэлэлтгүйгээр
дахин оролддог — мэдлэгийн сан чимээгүй алга болохгүй.

## Ажиллуулах алхмууд

### 1. Орчны хувьсагч (Vercel)

```
GEMINI_API_KEY                 # aistudio.google.com/app/apikey
FIREBASE_SERVICE_ACCOUNT_JSON  # аль хэдийн байгаа бол болно
FB_VERIFY_TOKEN                # 32+ тэмдэгт санамсаргүй мөр, өөрөө зохионо
```

Заавал биш: `GEMINI_MODELS` (fallback chain override), `FB_APP_ID`/`FB_APP_SECRET` (OAuth).

### 2. Firestore

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Дараа нь Console-оос дээрх 2 TTL policy-г гараар тохируулна.

### 3. Facebook App

1. developers.facebook.com/apps → Create App → Business
2. Add Product → **Messenger** → Access Tokens → SAVANA хуудсаа сонгож token үүсгэнэ
3. Webhooks → Add Callback URL:
   - URL: `https://<домэйн>/api/chat/webhook`
   - Verify Token: `FB_VERIFY_TOKEN`-той **яг ижил** мөр
   - Subscribe fields: `messages`, `messaging_postbacks`, мөн сэтгэгдлийн хариу
     ашиглах бол `feed` (Facebook) болон `comments` (Instagram)
4. Subscribed Pages хэсэгт хуудсаа Subscribe хийнэ

### 4. Админ панелаас

**AI Chat → Чат тохиргоо**:
1. Page ID болон Page Access Token оруулна
2. "Messenger идэвхжүүлэх" + "Ботыг асаах" асаана
3. Хадгална
4. **"Facebook-д цэс суулгах"** дарна — цэс, мэндчилгээ суулгаж, token зөв эсэхийг шалгана

Instagram: IG Business хаягийг FB хуудастай холбосон бол "Instagram Direct идэвхжүүлэх"
асаахад л хангалттай — нэмэлт webhook хэрэггүй.

Виджет: "Вэб виджет" асаавал savana.mn дээр гарч ирнэ.

### 5. Мэдлэг оруулах

**AI Chat → Мэдлэгийн сан**: "AI-аар үүсгэх" дарж каталогоос 8 FAQ гаргуулаад **хянаж
засна**. Үүссэн FAQ нь идэвхгүй байдлаар ирдэг — та шалгаж идэвхжүүлнэ.

### 6. Турших

**AI Chat → Хяналт** дээрх туршилтын чат нь **жинхэнэ production prompt**-оор ажиллана —
хэрэглэгчийн авах хариу яг тэр.

## Анхаарах

- **Page Access Token 60 хоног.** Дуусахаас өмнө шинэчлэх. Дууссан бол бот чимээгүй болно.
- **Vercel функцийн тоо** — одоо 13. Hobby plan дээр хязгаар байсан тул шалгах; шаардвал
  `/api/chat/[action].ts` болгож нэгтгэнэ.
- **Prompt-д хувийн мэдээлэл оруулахгүй.** `buildPrompt.ts` зөвхөн каталог, FAQ, тохиргоо
  уншина. `orders`, `users`, `customers`, `crmContacts` хэзээ ч биш.
- **Чатын хүсэлт `sales` руу ордог, `orders` руу биш.** SAVANA-д `orders` = storefront
  checkout; Messenger/Instagram/утас бүгд Sales модульд харьяалагдана. Хувиргалт
  `createSale`-ээр явдаг тул НӨАТ, өртөг, журналын бичилт автоматаар зөв.
- **Хувиргалт зөвхөн админаар.** Бот өөрөө захиалга үүсгэхгүй — буруу уншсан яриа
  дэвтэрт орохоос сэргийлнэ.

## Портлохдоо зассан бодит алдаанууд

Хуулаад орхисон бол SAVANA эдгээрийг өвлөх байсан:

| Алдаа | Үр дагавар |
|---|---|
| tegri `splitText` өгүүлбэрээр таслахдаа цэгийг дараагийн мессежийн эхэнд үлдээдэг | Хэрэглэгч `". Хүргэлт 1-2 өдөр."` гэсэн мессеж авдаг |
| Идэвхгүй бараа prompt-д ордог байсан | Бот зогссон бараа санал болгоно |
| Каталогийн таг эрэмбэлэлтгүй | 40 дэх барааны дараах нь санамсаргүйгээр алга болно |
| Индекс дутвал бүх FAQ чимээгүй алга болно | Мэдлэгийн сан ажиллахгүй, шалтгаан нь мэдэгдэхгүй |
| Танигдаагүй postback загвар руу очихгүй | Товч дарахад мэндчилгээ буцаана |
| Каруселийн "Захиалах" `productId` илгээдэг ч уншигддаггүй | Захиалах товч ажиллахгүй |

## Тест

780 тест (эхлэхэд 271 байсан). Чатын хэсэгт 20 файл: gemini, auth, assistant, buildPrompt,
guards, facebook, tools, conversation, webhook, reply, leads, widget, comments, followUp,
stats, faq store, lead store, chat api, settings, faq generator.

```bash
npm test          # 780 тест
npx tsc -b        # api/ фолдер ч шалгагдана (tsconfig.api.json)
npm run lint
```
