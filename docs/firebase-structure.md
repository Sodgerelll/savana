# Firebase Storefront Structure

This project now treats Firestore as the primary source of truth for both the public storefront and the admin panel.

## Database target

The app reads and writes to the Firestore database configured by `VITE_FIRESTORE_DATABASE_ID`.

- Current default in code: `(default)`
- Override when needed: create a local `.env.local` with `VITE_FIRESTORE_DATABASE_ID=savana` or another database id

## Root document

`sites/main`

Fields:

- `siteId`
- `schemaVersion`
- `createdAt`
- `updatedAt`

## Nested documents and collections

`sites/main/settings/general`

- brand and website settings
- hero content
- about/contact/find-us/wholesale content

`collections/{collectionId}`

- collection metadata
- `siteId` for storefront ownership
- storefront display name
- slug
- description
- gradient
- sort order

`products/{productId}`

- product catalog data
- `siteId` for storefront ownership
- price and compare-at price
- category link
- badge / best-seller flags
- variant list
- sort order

`sites/main/markets/{marketId}`

- market/event cards shown on the website

`sites/main/testimonials/{testimonialId}`

- homepage testimonial blocks

## Read/write model

- Public pages read Firestore through realtime listeners in `src/context/StorefrontContext.tsx`.
- Admin changes update local UI optimistically, then persist to Firestore through `src/lib/storefrontRepository.ts`.
- If Firestore is empty on first run, the app seeds it from the existing default dataset.
- If legacy collections still exist at `sites/main/collections/*`, authenticated admin sessions migrate them into the top-level `collections/*` collection.
- If legacy products still exist at `sites/main/products/*`, authenticated admin sessions migrate them into the top-level `products/*` collection.
- If legacy local admin data exists in browser localStorage, the first seed migrates that data into Firestore.

## Security baseline

The included `firestore.rules` file allows:

- public read access for storefront content
- authenticated write access for admin updates

For production, tighten this further by restricting writes to approved admin users or custom claims.
