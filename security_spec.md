# Print Point Security Specification

## Project
- Firebase Project ID: `printingkiosk-1e1b7`
- Firestore Database: `(default)`

## Core Principles
1. **Default Deny:** Unmatched paths are explicitly rejected (`allow read, write: if false`).
2. **Authentication & Ownership:** User documents (`/users/{uid}`, `/wallets/{uid}`, `/printDocuments/{docId}`, `/printOrders/{orderId}`, `/kioskSessions/{token}`) require a valid Firebase ID token (`request.auth != null && request.auth.uid != null`) with matching ownership.
3. **Server-Authoritative Financial & Job State:** Client code cannot directly create or mutate `/wallets/{uid}`, `/wallets/{uid}/transactions/{txId}`, `/paymentOrders/{orderId}`, `/printOrders/{orderId}`, `/printDocuments/{docId}`, `/kioskSessions/{token}`, or `/kioskStations/{stationId}`. All wallet credits/debits, Razorpay verification, document conversion metadata, pricing quotes, and print job release statuses are written exclusively by the backend server (Express API / Firebase Admin SDK).
4. **Immutable User Fields & Anti-Privilege Escalation:** Users may update only safe display fields (`name`, `phone`, `photoURL`, `language`, `notificationsEnabled`, `updatedAt`) on `/users/{uid}` and may never escalate `role` beyond `'user'` or alter `uid` / `email` / `joinedDate`.
5. **Storage Isolation:** Raw and converted documents in Firebase Storage under `kiosks/{uid}/{sessionToken}/{docId}/{fileName}` are accessible only to the owning authenticated user (`request.auth.uid == uid`), with size caps (100 MB) and permitted content types.
