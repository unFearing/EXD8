---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-02b-vision", "step-02c-executive-summary", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish", "step-12-complete"]
inputDocuments: ["domain-mwo-competitive-league-research-2026-05-08.md"]
workflowType: 'prd'
projectType: 'greenfield'
date: '2026-05-08'
user_name: 'unF'
project_name: 'EXD8'
classification:
  projectType: 'Web Application'
  domain: 'Gaming/Esports (MWO Competitive)'
  complexity: 'Medium'
  projectContext: 'Greenfield'
  backend: 'CosmosDB (Azure)'
  auth: 'Discord OAuth (role-mapped)'
  audience: 'Internal (Team-scoped)'
  realtime: true
  primaryUsers:
    - 'Team Leads (full CRUD)'
    - 'Teammates (read-only)'
  mvpScope:
    - 'Drop deck management'
    - 'Build repository'
    - 'Pilot assignments'
    - 'Map integration'
  botStatus: 'Bonus feature (Phase 2+)'
  rollout:
    - 'Phase 1: Foam repo + Discord OAuth'
    - 'Phase 2: Real-time deck builder + CosmosDB'
    - 'Phase 3: Discord bot integration'
---

# Product Requirements Document - EXD8

**Author:** unF
**Date:** 2026-05-08
**Project:** MWO Competitive Build Management Platform

---

## Executive Summary

**EXD8** is a web-based competitive drop deck management platform designed for MechWarrior Online esports teams to rapidly iterate and communicate drop deck configurations. The platform addresses the core friction in competitive team preparation: **deck changes happen weekly, but manual management via spreadsheets consumes time, obscures rationale, and creates pilot confusion**.

The system consolidates drop deck data, build specifications, pilot assignments, and map information into a single source of truth with fluid UX optimized for speed and clarity. Drop decks can be modified, visualized, and understood in seconds rather than minutes. Pilots can see their assignments, understand their role within the deck, and load pre-configured skill codes before match time. All edits are **reflected in real-time** for every connected team member simultaneously — no refreshes, no version conflicts.

Access is managed entirely through **Discord OAuth**, mapping existing server roles directly to platform permissions. Team leads gain write access; teammates gain read-only access. No separate accounts, no password management — team membership in Discord is the source of truth.

**Target Users:**
- **Team Leads** (`@TL` Discord role): Full CRUD. Create and modify drop decks across the season, add/edit builds, assign pilots, slate backup candidates.
- **Teammates** (`@Pilot` Discord role): Read-only. View drop deck assignments, understand build rationale, load provided skill codes.

**Team Scope:** Internal team tool — not multi-team, not open community.

### What Makes This Special

EXD8 is a **clarity and velocity tool**, not a strategy tool. The product's unique value centers on three moments:

1. **Iteration Speed** — Changing a single build or swapping a pilot reveals the entire deck's new configuration instantly. What once took 5+ minutes of manual spreadsheet updates takes seconds. Decks evolve weekly based on practice and map rotation; the tool must keep pace.

2. **Information Clarity** — Drop decks are visually presented with key build factors (ECM, BAP, jump jets, speed, role) immediately visible. Pilots understand not just what they're flying but why that mech was chosen for this deck. Build titles and descriptions carry the context that spreadsheet cells cannot.

3. **Effortless Preparation** — The entire competitive preparation flow collapses into a single interface: view deck → understand role → load skill code. Pilots spend zero time searching for information before match start.

**Core Insight:** Competitive team success depends on rapid strategic iteration and pilot clarity. Removing friction from deck management directly improves team morale (organization matters) and match execution (pilots are prepared).

### Project Classification

| Attribute | Value |
|-----------|-------|
| **Project Type** | Web Application (team management) |
| **Domain** | Gaming/Esports (MechWarrior Online competitive) |
| **Complexity** | Medium |
| **Project Context** | Greenfield |
| **Backend** | Azure CosmosDB |
| **Authentication** | Discord OAuth (role-mapped to server roles) |
| **Real-Time Sync** | Yes (WebSockets — all edits reflected live) |
| **Audience** | Internal team-scoped |
| **Rollout** | Staged (Foam repo → Real-time deck builder → Discord bot) |

---

---

## Success Criteria

### User Success

- A team lead can swap a mech in a drop deck and have all teammates see the change in under 3 seconds
- A pilot can view their full match-night assignment (drop, mech, build link, skill code) without asking in Discord
- Drop deck changes that previously took 5+ minutes in Google Sheets take under 30 seconds in EXD8
- The team retires Google Sheets for deck management within 2 weeks of EXD8 launch

### Business / Team Success

- Measurable reduction in pre-match coordination messages in Discord ("what am I running tonight?")
- All team members log in successfully via Discord OAuth within the first match night
- Team morale improvement attributable to organizational clarity (qualitative feedback)

### Technical Success

- Real-time updates propagate to all connected clients within 2 seconds of a change
- Application is available and performant for all match nights (zero downtime during scheduled play)
- Discord role changes reflect in platform access within one login cycle
- Data persists correctly in CosmosDB across sessions with no loss

### Measurable Outcomes

| Outcome | Target |
|---------|--------|
| Deck update speed | < 30 seconds end-to-end |
| Real-time sync latency | < 3 seconds |
| Pilot prep questions in Discord | Reduced to near zero |
| Team adoption | 100% within first match night |
| Sheets retirement | Within 2 weeks of launch |

---

## Product Scope

### MVP — Minimum Viable Product (Phase 1)

Core: get the team off Google Sheets for deck management.

- Drop deck views for all 5 drops (configurable per league)
- Per-drop mech slot management (assign chassis, variant, pilot)
- Build links and skill codes visible per mech slot
- Key build factors visible per slot (ECM, BAP, JJs, speed, role label)
- Real-time sync (all edits visible to all connected users instantly)
- Discord OAuth authentication (role-mapped: TL write, Pilot read)
- Map information per drop (links provided by TL)
- Backup/candidate pilot slating per slot

### Growth Features (Phase 2)

- Discord bot integration (populate builds and deck slots from Discord)
- Build repository (browsable library of builds with descriptions and codes)
- League rule configuration (set drop composition rules, chassis equivalences)
- Historical deck snapshots (view what a deck looked like on a given match night)
- Mobile-responsive layout improvements

### Vision (Phase 3+)

- Match result logging and win-rate tracking per build/drop
- Multi-league support
- Performance analytics dashboard
- Community build sharing (optional, gated)

---

## User Journeys

### Journey 1: Team Lead Updates Drop Deck (Pre-Match)

1. TL logs in via Discord ("Sign in with Discord") → lands on current season overview
2. Navigates to current week's match → selects Drop 3
3. Sees 8 mech slots laid out with current assignments
4. Clicks a Heavy slot → types chassis/variant → selects build from repository or pastes link
5. Adds skill code and key build factors (ECM: yes, speed: 78 kph)
6. Change saves and propagates to all teammates in < 3 seconds
7. Slates a backup pilot on one slot for flexibility

### Journey 2: Pilot Prepares for Match Night

1. Pilot logs in via Discord → lands on current week's drops
2. Sees all 5 drops with their personal assignments highlighted
3. Views Drop 2 → sees their mech, build link, skill code, map link
4. Clicks build link → loads into MWO MechLab
5. Copies skill code → sets skill tree in-game
6. Ready to play — zero Discord questions needed

### Journey 3: Team Lead Iterates Mid-Week

1. TL reviews Drop 5 deck after practice session
2. Decides to swap an Assault for a different chassis
3. Opens Drop 5 → changes one slot
4. Optionally adds a note/description to the build explaining the change
5. Teammates browsing the site see the update instantly

---

## Domain Context

### League Rules Engine

Rules are **user-configurable**, not hardcoded. TLs define:

- Number of drops per match night (default: 5)
- Per-drop force composition (e.g., Drop 1 = 4 Light + 4 Medium)
- Special restrictions per drop (e.g., Drop 1 = no lock-on weapons)
- Chassis equivalence groupings (e.g., Summoner = Grand Summoner)
- Duplicate chassis allowance (e.g., max 1 duplicate per drop)

The system validates drop deck configurations against the configured rules and surfaces violations to the TL before match night.

### Mech Data

Mech information (chassis, weight class, hardpoints, key equipment flags) is sourced from MechDB (mwo.nav-alpha.com) and cached locally. Key build factors surfaced per slot:

- **ECM** (yes/no)
- **BAP** (Beagle Active Probe — yes/no)
- **JJs** (Jump Jets — yes/no)
- **Speed** (top speed in kph)
- **Role** (free-text label: brawler, sniper, support, scout, etc.)

---

## Functional Requirements

### Authentication and Access

| ID | Requirement |
|----|-------------|
| AUTH-01 | Users authenticate via Discord OAuth2 |
| AUTH-02 | Discord server role `@TL` grants full write access |
| AUTH-03 | Discord server role `@Pilot` grants read-only access |
| AUTH-04 | Users not in the Discord server are denied access |
| AUTH-05 | Role changes in Discord reflect on next login |
| AUTH-06 | Session persists across browser tabs and refreshes |

### Drop Deck Management

| ID | Requirement |
|----|-------------|
| DECK-01 | TL can create a match night with up to N drops (configurable) |
| DECK-02 | Each drop displays 8 mech slots in a clear visual layout |
| DECK-03 | Each slot stores: chassis, variant, pilot name, build link, skill code, role label, ECM/BAP/JJs/speed flags |
| DECK-04 | TL can assign or reassign any slot value inline (no separate form/page) |
| DECK-05 | TL can slate a slot as "candidate / backup" with optional candidate pilot name |
| DECK-06 | All slot edits are saved and propagated in real-time (< 3 seconds) |
| DECK-07 | Each drop shows configured map and a link to map information |
| DECK-08 | System validates drop deck against configured league rules and surfaces violations |
| DECK-09 | TL can add a second drop with the same or different composition if the match format requires it |

### Build Repository

| ID | Requirement |
|----|-------------|
| REPO-01 | TL can add a build to the repository with: chassis, variant, role, build link, skill code, description, key factors |
| REPO-02 | Builds are browsable and searchable by weight class, role, chassis |
| REPO-03 | When assigning a mech slot, TL can pull from the repository |
| REPO-04 | Teammates can browse the repository read-only |
| REPO-05 | Discord bot (Phase 2) can populate builds into the repository |

### League Rules Configuration

| ID | Requirement |
|----|-------------|
| RULES-01 | TL can configure number of drops per match |
| RULES-02 | TL can configure force composition per drop (e.g., 2L + 4M + 2H) |
| RULES-03 | TL can configure special restrictions per drop (free-text or structured) |
| RULES-04 | TL can configure chassis equivalence groups |
| RULES-05 | TL can configure max duplicate chassis per drop |
| RULES-06 | System surfaces rule violations on the deck view without blocking edits |

### Real-Time Sync

| ID | Requirement |
|----|-------------|
| SYNC-01 | All connected clients receive deck updates within 3 seconds |
| SYNC-02 | Conflict resolution favours the most recent write |
| SYNC-03 | Offline users see current state on next load |

### Discord Bot (Phase 2)

| ID | Requirement |
|----|-------------|
| BOT-01 | Bot accepts `/submit-build` command with mech, role, build link, skill code |
| BOT-02 | Bot accepts `/find-build` query by role, weight class, chassis |
| BOT-03 | Bot posts build card embeds to specified channel |
| BOT-04 | Bot reads from and writes to the same CosmosDB instance as the website |

---

## Non-Functional Requirements

### Performance

| ID | Requirement |
|----|-------------|
| PERF-01 | Real-time update latency < 3 seconds under normal conditions |
| PERF-02 | Page initial load < 2 seconds on standard broadband |
| PERF-03 | Deck edit operations (save/propagate) < 1 second server-side |

### Reliability

| ID | Requirement |
|----|-------------|
| REL-01 | Application available during all scheduled match nights |
| REL-02 | No data loss on concurrent edits |
| REL-03 | Graceful degradation if MechDB is unavailable (use cached mech data) |

### Security

| ID | Requirement |
|----|-------------|
| SEC-01 | All traffic over HTTPS |
| SEC-02 | Discord OAuth tokens stored securely (server-side, not client) |
| SEC-03 | Write operations server-side validated against user role |
| SEC-04 | No sensitive data exposed in client-side code |
| SEC-05 | CosmosDB access via server-side API only (no direct client access) |

### Usability

| ID | Requirement |
|----|-------------|
| UX-01 | Deck editing is inline — no separate forms or modal dialogs for routine changes |
| UX-02 | UI is legible in a dark/gaming aesthetic |
| UX-03 | All critical information visible without horizontal scrolling on 1080p |
| UX-04 | Pilot's own assignments visually highlighted |
| UX-05 | Key build factors (ECM, BAP, JJs, speed) visible at a glance per slot |

### Technology Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React or Vue.js (TBD in Architecture) |
| **Backend / API** | Node.js or Python FastAPI |
| **Database** | Azure CosmosDB |
| **Authentication** | Discord OAuth2 |
| **Real-Time** | WebSockets (Azure Web PubSub or socket.io) |
| **Hosting** | Azure Static Web Apps + Azure Functions |
| **Discord Bot** | discord.py or discord.js (Phase 2) |

---

## Out of Scope

The following are explicitly **not** in scope for MVP or Phase 2:

- Strategy documentation or strategic analysis tools
- Opponent scouting or enemy build tracking
- Public community build sharing
- Multi-team / multi-organization support
- Mobile native application
- In-game telemetry or API integration with MWO client
- Match scheduling or calendar management
- Payment or subscription management

---

## Risks and Assumptions

### Assumptions

- All team members have Discord accounts and are members of the team server
- Team lead has Azure access (credits available for CosmosDB)
- MechDB data is sufficient for mech validation and is reasonably stable
- Team size remains small enough that CosmosDB free tier or Azure credits cover costs indefinitely

### Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Discord OAuth complexity | Delays Phase 1 | Use well-documented library (passport-discord or similar) |
| Real-time sync complexity | Delays Phase 1 | Use Azure Web PubSub (managed service, minimal infrastructure) |
| Low team adoption | Product fails | Involve team in design; migrate one match night at a time |
| MechDB downtime | Build data unavailable | Cache mech data locally; update on schedule |
| Rule changes mid-season | Validation breaks | Make all rules user-configurable (no hardcoded logic) |

---

*PRD complete. Next phase: Architecture Design.*
