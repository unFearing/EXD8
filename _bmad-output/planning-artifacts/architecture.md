---
stepsCompleted: [1]
inputDocuments: ["prd.md", "domain-mwo-competitive-league-research-2026-05-08.md"]
workflowType: 'architecture'
project_name: 'EXD8'
user_name: 'unF'
date: '2026-05-08'
---

---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: ["prd.md", "domain-mwo-competitive-league-research-2026-05-08.md"]
workflowType: 'architecture'
project_name: 'EXD8'
user_name: 'unF'
date: '2026-05-08'
---

# Architecture Decision Document — EXD8

**Date:** 2026-05-08  
**Author:** unF  
**Based On:** EXD8 PRD v1.0

---

## Table of Contents

1. System Overview
2. Technology Stack
3. Project Structure
4. Data Architecture
5. Authentication & Authorization
6. Real-Time Sync
7. API Design
8. Frontend Architecture
9. Infrastructure & Deployment
10. Security Decisions
11. Integration Points
12. Development Conventions

---

## 1. System Overview

EXD8 is a two-phase web platform for MWO competitive team management.

### Phased Architecture

**Phase 1 — Static Foam Repository + Auth**
- Jekyll-based static site (existing Foam workspace)
- Discord OAuth gate (server-side token validation)
- Hosted on Azure Static Web Apps
- Read-only for teammates; TL can push updates via git

**Phase 2 — Interactive Deck Builder**
- React SPA layered on top of or alongside the static site
- Azure CosmosDB (NoSQL) as source of truth
- Real-time sync via Azure Web PubSub (WebSockets managed service)
- Azure Functions as API layer
- Discord OAuth extended with role-based CRUD permissions

### System Context Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Discord Server                     │
│   @TL role → write    @Pilot role → read             │
└───────────────────────┬─────────────────────────────┘
                        │ Discord OAuth2
                        ▼
┌─────────────────────────────────────────────────────┐
│              Azure Static Web Apps                    │
│  ┌─────────────────┐    ┌────────────────────────┐  │
│  │  Phase 1        │    │  Phase 2               │  │
│  │  Jekyll/Foam    │    │  React SPA             │  │
│  │  Static Pages   │    │  Deck Builder          │  │
│  └─────────────────┘    └──────────┬─────────────┘  │
└─────────────────────────────────────┼───────────────┘
                                      │ REST + WebSocket
                          ┌───────────▼───────────┐
                          │  Azure Functions API  │
                          └───────────┬───────────┘
                      ┌───────────────┼───────────────┐
                      ▼               ▼               ▼
              ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
              │ CosmosDB     │ │ Azure Web    │ │ MechDB API   │
              │ (NoSQL)      │ │ PubSub       │ │ (external)   │
              └──────────────┘ └──────────────┘ └──────────────┘
```

---

## 2. Technology Stack

### Confirmed Decisions

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React 18 + TypeScript | Mature ecosystem, real-time UI patterns, Azure integration |
| **Styling** | Tailwind CSS | Utility-first, rapid dark theme UI, consistent gaming aesthetic |
| **State Management** | Zustand | Lightweight, simple API, no boilerplate overhead |
| **Backend** | Azure Functions (Node.js) | Serverless, Azure credits, minimal infrastructure |
| **Database** | Azure CosmosDB (NoSQL/JSON) | Azure credits, flexible schema, managed service |
| **Real-Time** | Azure Web PubSub | Managed WebSocket service, Azure credits, minimal setup |
| **Auth** | Discord OAuth2 | Team already uses Discord; role-mapped permissions |
| **Static Site** | Jekyll (existing Foam) | Phase 1 existing workspace, no rewrite needed |
| **Hosting** | Azure Static Web Apps | Azure credits, built-in CDN, SWA + Functions integration |
| **CI/CD** | GitHub Actions | Free for public/private repos, Azure deploy integration |
| **Build Tool** | Vite | Fast HMR, ESM-native, production-optimized bundles |
| **Discord Bot** | discord.py or discord.js (Phase 3) | Well-maintained libraries for bot development |

### Version Targets (at time of writing)

| Package | Version |
|---------|---------|
| React | 18.x |
| TypeScript | 5.x |
| Node.js | 20 LTS |
| Tailwind CSS | 3.x |
| Zustand | 4.x |
| Vite | 5.x |

---

## 3. Project Structure

```
exd8/
├── .github/
│   └── workflows/
│       ├── deploy-static.yml      # Phase 1 Jekyll deploy
│       └── deploy-app.yml         # Phase 2 React + Functions deploy
│
├── docs/                          # Phase 1: Jekyll/Foam static site (existing)
│   ├── _layouts/
│   ├── assets/
│   ├── mwo/                       # MWO content (builds, etc.)
│   └── _config.yml
│
├── app/                           # Phase 2: React SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── deck/              # Drop deck UI components
│   │   │   ├── builds/            # Build repository components
│   │   │   ├── auth/              # Discord OAuth UI
│   │   │   └── ui/                # Shared UI primitives
│   │   ├── hooks/                 # Custom React hooks
│   │   │   ├── useRealtime.ts     # Azure Web PubSub WebSocket hook
│   │   │   ├── useDeck.ts         # Deck CRUD operations
│   │   │   └── useAuth.ts         # Discord OAuth session
│   │   ├── store/                 # Zustand state slices
│   │   │   ├── deckStore.ts
│   │   │   ├── buildStore.ts
│   │   │   └── authStore.ts
│   │   ├── api/                   # API client (typed fetch wrappers)
│   │   ├── types/                 # Shared TypeScript types
│   │   └── pages/                 # Route-level components
│   │       ├── SeasonView.tsx
│   │       ├── DropDeckView.tsx
│   │       ├── BuildRepository.tsx
│   │       └── RulesConfig.tsx
│   ├── public/
│   ├── vite.config.ts
│   └── package.json
│
├── api/                           # Azure Functions (Node.js)
│   ├── src/
│   │   ├── functions/
│   │   │   ├── auth/              # Discord OAuth token exchange
│   │   │   ├── decks/             # Deck CRUD endpoints
│   │   │   ├── builds/            # Build repository endpoints
│   │   │   ├── rules/             # League rules endpoints
│   │   │   └── realtime/          # Web PubSub negotiate endpoint
│   │   ├── middleware/
│   │   │   ├── authGuard.ts       # Validate Discord session + role
│   │   │   └── validateDeck.ts    # Deck composition rule enforcement
│   │   ├── db/
│   │   │   └── cosmos.ts          # CosmosDB client + query helpers
│   │   └── types/                 # Shared API types
│   ├── host.json
│   └── package.json
│
└── staticwebapp.config.json       # Azure SWA routing config
```

---

## 4. Data Architecture

### CosmosDB Design

**Database:** `exd8`  
**Partition Strategy:** partition by `teamId` (single team now, ready to scale)

### Container: `seasons`

```json
{
  "id": "season-2026-spring",
  "teamId": "exd8",
  "name": "MBA Spring 2026",
  "leagueRules": {
    "drops": [
      {
        "dropNumber": 1,
        "name": "Reconnaissance",
        "gameMode": "Domination",
        "composition": { "Light": 4, "Medium": 4, "Heavy": 0, "Assault": 0 },
        "specialRestrictions": ["No lock-on weapons"],
        "maxDuplicateChassis": 1
      },
      {
        "dropNumber": 2,
        "name": "Recon in Force",
        "gameMode": "Conquest",
        "composition": { "Light": 2, "Medium": 4, "Heavy": 2, "Assault": 0 },
        "specialRestrictions": [],
        "maxDuplicateChassis": 1
      }
    ],
    "chassisEquivalences": [
      ["Archer", "Clan Archer"],
      ["Summoner", "Grand Summoner"],
      ["Nova", "Black Hawk KU"]
    ],
    "maps": {
      "round1": { "drop1": "Caustic Valley", "drop2": "HPG Manifold" }
    }
  },
  "createdAt": "2026-05-08T00:00:00Z"
}
```

### Container: `matchNights`

```json
{
  "id": "match-2026-05-08",
  "teamId": "exd8",
  "seasonId": "season-2026-spring",
  "date": "2026-05-08",
  "round": 1,
  "opponent": "Waco's Rangers",
  "drops": [
    {
      "dropNumber": 1,
      "slots": [
        {
          "slotId": "d1-s1",
          "weightClass": "Light",
          "chassis": "Jenner IIC",
          "variant": "JR7-IIC-A",
          "pilot": "unF",
          "candidatePilots": [],
          "buildLink": "https://mwo.nav-alpha.com/mechlab?build=...",
          "skillCode": "AAABBBCCC...",
          "role": "Scout",
          "keyFactors": {
            "ecm": false,
            "bap": true,
            "jumpJets": false,
            "speedKph": 148
          },
          "isBackup": false,
          "notes": ""
        }
      ],
      "mapLink": "https://...",
      "locked": false
    }
  ],
  "updatedAt": "2026-05-08T12:00:00Z",
  "updatedBy": "discord-user-id"
}
```

### Container: `builds`

```json
{
  "id": "build-tbr-sniper-01",
  "teamId": "exd8",
  "chassis": "Timber Wolf",
  "variant": "TBR-PRIME",
  "weightClass": "Heavy",
  "faction": "Clan",
  "role": "Sniper",
  "buildLink": "https://mwo.nav-alpha.com/mechlab?build=...",
  "skillCode": "AAABBBCCC...",
  "description": "Dual ERPPC sniper, fast for a heavy",
  "keyFactors": {
    "ecm": false,
    "bap": false,
    "jumpJets": false,
    "speedKph": 81
  },
  "submittedBy": "discord-user-id",
  "submittedAt": "2026-05-08T00:00:00Z",
  "tags": ["sniper", "heavy", "meta"]
}
```

### Container: `users`

```json
{
  "id": "discord-user-id",
  "teamId": "exd8",
  "discordUsername": "unF",
  "discordAvatar": "...",
  "role": "TL",
  "lastLoginAt": "2026-05-08T00:00:00Z"
}
```

---

## 5. Authentication & Authorization

### Discord OAuth2 Flow

```
1. User clicks "Sign in with Discord"
2. Browser → Discord OAuth authorize URL
   (scopes: identify, guilds.members.read)
3. Discord → redirects to /api/auth/callback?code=XXX
4. Azure Function: exchanges code for access token (server-side)
5. Azure Function: fetches user's guild member info + roles
6. Azure Function: determines role (TL / Pilot / denied)
7. Azure Function: issues signed HTTP-only session cookie
8. Browser: all subsequent requests include cookie
9. Azure Function middleware: validates cookie on every request
```

### Role Mapping

| Discord Server Role | Platform Permission |
|--------------------|--------------------|
| `@TL` | Full CRUD: create/edit decks, builds, rules |
| `@Pilot` | Read-only: view all decks and builds |
| Not in server | 403 Denied |

### Session Token

- HTTP-only cookie (not accessible to JavaScript)
- Signed with server-side secret (stored in Azure Key Vault)
- Contains: `{ userId, discordId, role, expiresAt }`
- Expiry: 7 days; re-validated on next Discord login

### API Auth Guard (every protected endpoint)

```typescript
// api/src/middleware/authGuard.ts
export async function requireAuth(req, context) {
  const session = validateSessionCookie(req.headers.cookie)
  if (!session) return { status: 401 }
  if (writeMethods.includes(req.method) && session.role !== 'TL') {
    return { status: 403 }
  }
  return session
}
```

---

## 6. Real-Time Sync

### Azure Web PubSub Pattern

```
Client connects → GET /api/realtime/negotiate
  → Azure Function returns signed WebSocket URL
  → Client connects to Azure Web PubSub directly

TL edits a slot → POST /api/decks/:matchId/drops/:drop/slots/:slot
  → Azure Function: validates auth + rules
  → Azure Function: writes to CosmosDB
  → Azure Function: publishes message to Web PubSub group ("match-2026-05-08")
  → All connected clients receive the update instantly
  → Client: Zustand store updates → React re-renders slot
```

### WebSocket Message Shape

```json
{
  "type": "SLOT_UPDATED",
  "matchId": "match-2026-05-08",
  "dropNumber": 1,
  "slotId": "d1-s1",
  "data": { ...updated slot fields... },
  "updatedBy": "unF",
  "timestamp": "2026-05-08T12:00:00Z"
}
```

### Client Hook

```typescript
// app/src/hooks/useRealtime.ts
export function useRealtime(matchId: string) {
  const updateSlot = useDeckStore(s => s.updateSlot)
  
  useEffect(() => {
    const ws = connectToPubSub(matchId)
    ws.on('SLOT_UPDATED', (msg) => updateSlot(msg.slotId, msg.data))
    return () => ws.close()
  }, [matchId])
}
```

---

## 7. API Design

### REST Endpoints (Azure Functions)

#### Auth
```
GET  /api/auth/login       → Redirect to Discord OAuth
GET  /api/auth/callback    → Handle OAuth redirect, set session cookie
POST /api/auth/logout      → Clear session cookie
GET  /api/auth/me          → Return current user + role
```

#### Match Nights
```
GET  /api/matches                     → List match nights for season
POST /api/matches                     → Create match night (TL only)
GET  /api/matches/:matchId            → Full match night with all drops
PATCH /api/matches/:matchId           → Update match metadata (TL only)
```

#### Slots
```
PATCH /api/matches/:matchId/drops/:drop/slots/:slot
  → Update a single slot (TL only)
  → Validates against league rules
  → Publishes real-time update
```

#### Builds
```
GET  /api/builds                      → List builds (filterable)
POST /api/builds                      → Add build (TL only)
PATCH /api/builds/:buildId            → Edit build (TL only)
DELETE /api/builds/:buildId           → Remove build (TL only)
```

#### Rules
```
GET  /api/seasons/:seasonId/rules     → Get league rules
PUT  /api/seasons/:seasonId/rules     → Update rules (TL only)
```

#### Real-Time
```
GET  /api/realtime/negotiate?matchId= → Return signed WebSocket URL
```

### Error Response Shape

```json
{
  "error": "RULE_VIOLATION",
  "message": "Drop 1 cannot contain Heavy class mechs",
  "field": "weightClass",
  "dropNumber": 1
}
```

---

## 8. Frontend Architecture

### Page Routes

```
/                     → Season overview (list of match nights)
/match/:matchId       → Match night view (all 5 drops tabbed)
/match/:matchId/:drop → Single drop deck view (deep link)
/builds               → Build repository (browsable/searchable)
/rules                → League rules config (TL only)
```

### Component Hierarchy

```
App
├── AuthProvider (Discord session context)
├── RealtimeProvider (Web PubSub connection)
└── Router
    ├── SeasonView
    │   └── MatchNightCard[]
    ├── MatchNightView
    │   ├── DropTabNav
    │   └── DropDeckView
    │       └── MechSlotRow[] (8 slots)
    │           ├── WeightClassBadge
    │           ├── ChassisVariantField (inline edit, TL only)
    │           ├── PilotField (inline edit, TL only)
    │           ├── BuildLink
    │           ├── SkillCodeCopyButton
    │           ├── KeyFactorBadges (ECM / BAP / JJ / speed)
    │           └── BackupPilotIndicator
    ├── BuildRepository
    │   ├── BuildFilters (weight class, role, chassis)
    │   └── BuildCard[]
    └── RulesConfig (TL only)
        ├── DropCompositionEditor
        └── ChassisEquivalenceEditor
```

### Inline Editing Pattern (No Modals)

Slot fields are editable in-place for TLs:

```typescript
// Clicking a field activates an inline input
// Blur or Enter → optimistic update + API PATCH
// Real-time update arrives → confirm or reconcile

function ChassisVariantField({ slotId, value, canEdit }) {
  const [editing, setEditing] = useState(false)
  const patch = useDeckStore(s => s.patchSlot)

  return editing && canEdit
    ? <input autoFocus defaultValue={value}
        onBlur={e => { patch(slotId, { variant: e.target.value }); setEditing(false) }} />
    : <span onClick={() => canEdit && setEditing(true)}>{value || '—'}</span>
}
```

### Visual Design Constraints

- Dark background (`#0a0a0a` matching MechDB aesthetic)
- Accent: amber/orange (mech-themed)
- Monospace font for chassis names, codes
- Weight class colour coding: Light = blue, Medium = green, Heavy = orange, Assault = red
- Key factor badges: small pill labels inline per slot

---

## 9. Infrastructure & Deployment

### Azure Services Used

| Service | Purpose | Tier |
|---------|---------|------|
| Azure Static Web Apps | Host frontend + route to Functions | Free/Standard |
| Azure Functions | API layer (Node.js v4) | Consumption (pay-per-call) |
| Azure CosmosDB | NoSQL database | Free tier (400 RU/s, 5GB) |
| Azure Web PubSub | Managed WebSockets | Free tier (20k connections/day) |
| Azure Key Vault | Discord OAuth secret storage | Standard |

### Deployment Flow

```
Push to main →
  GitHub Actions:
    1. Build React app (Vite)
    2. Build Azure Functions
    3. Deploy to Azure Static Web Apps
       (SWA handles frontend + Functions routing automatically)
```

### Environment Variables (via Azure App Settings)

```
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_GUILD_ID=        # Your Discord server ID
DISCORD_TL_ROLE_ID=      # @TL role ID
DISCORD_PILOT_ROLE_ID=   # @Pilot role ID
SESSION_SECRET=          # From Azure Key Vault
COSMOS_CONNECTION_STRING=# From Azure Key Vault
WEBPUBSUB_CONNECTION_STRING=
MECHDB_BASE_URL=https://mwo.nav-alpha.com
```

### `staticwebapp.config.json`

```json
{
  "routes": [
    { "route": "/api/*", "allowedRoles": ["authenticated"] },
    { "route": "/auth/*", "allowedRoles": ["anonymous"] },
    { "route": "/*", "allowedRoles": ["anonymous"] }
  ],
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/api/*", "/_static/*"]
  }
}
```

---

## 10. Security Decisions

| Decision | Implementation |
|----------|---------------|
| No client-side secrets | All Discord secrets in Azure Functions + Key Vault only |
| HTTP-only session cookie | Not accessible to JavaScript; immune to XSS token theft |
| Server-side role validation | Every write endpoint validates role from session, not client |
| No direct DB access | CosmosDB never exposed to client; only via Azure Functions |
| HTTPS everywhere | Azure SWA enforces HTTPS; HTTP → redirect |
| Input sanitisation | All user inputs sanitised before DB writes |
| Rate limiting | Azure API Management or custom middleware on auth endpoints |

---

## 11. Integration Points

### MechDB API

- **Purpose:** Validate chassis names, weight class, fetch key equipment flags
- **Usage:** Called on build submission; results cached in CosmosDB
- **Fallback:** If MechDB unavailable, use cached data; surface warning to TL
- **Cache TTL:** 24 hours (patch updates are infrequent)

```typescript
// api/src/functions/builds/validateMech.ts
export async function validateMech(chassis: string, variant: string) {
  // 1. Check CosmosDB cache
  // 2. If stale, fetch from MechDB
  // 3. Return { weightClass, faction, ecmCapable, ... }
}
```

### Discord Bot (Phase 3)

- Bot authenticates to Azure Functions with a bot service token (not OAuth)
- Bot uses same CosmosDB containers as website
- Bot slash commands call REST API endpoints
- No direct DB access from bot

---

## 12. Development Conventions

### TypeScript Strictness

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| React components | PascalCase | `MechSlotRow` |
| Hooks | camelCase, `use` prefix | `useDeckStore` |
| Azure Functions | camelCase files | `patchSlot.ts` |
| CosmosDB containers | camelCase plural | `matchNights` |
| Environment vars | SCREAMING_SNAKE_CASE | `DISCORD_CLIENT_ID` |
| CSS classes | Tailwind utilities | `bg-zinc-900 text-amber-400` |

### Optimistic Updates Pattern

All inline edits use optimistic updates:

1. Update local Zustand store immediately (UI feels instant)
2. Fire `PATCH` to API
3. On success: real-time WebSocket update confirms to all other clients
4. On failure: revert Zustand store, show inline error

### Rule Validation

Rule violations are non-blocking (surface warnings, don't prevent saves):

```typescript
// Validate on slot update, return violations array
export function validateDrop(drop: Drop, rules: DropRules): Violation[] {
  return [
    ...checkComposition(drop, rules.composition),
    ...checkDuplicateChassis(drop, rules.maxDuplicateChassis),
    ...checkSpecialRestrictions(drop, rules.specialRestrictions),
  ]
}
```

---

*Architecture document complete. Ready for implementation.*
