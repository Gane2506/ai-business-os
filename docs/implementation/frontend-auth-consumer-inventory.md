# Frontend Better Auth migration inventory

Pinned Ringee upstream: `b04a4b889a9c827e76f64574f6f3b2f1c5f79241`. Reconstructed with active cumulative patch 0003 from control repository `bd2a3cda1a31182e7a7f89d004835f5191ee0c3b`. Revalidated 2026-10-13 in disposable cloud scratch.

## Staged implementation

57 production files directly import Clerk; one existing regression-test file references it. Current Clerk routes, providers, middleware, locale handling, root Toaster, account enforcement, profile, organization operations and realtime stay active. UserAuthForm has no consumer imports: its fake success toast is replaced by a dormant, real email/password flow.

The Better Auth 1.7.7 browser adapter uses credentials include and the existing ApiClient. It returns only a validated Ringee principal from the future GET /api/auth/principal endpoint, never SDK session/token DTOs. UUID identities and exact org:admin/org:member roles are retained. Browser and server principal reads use no-store. A fresh server client receives each request's Cookie header; user cookies never enter the legacy shared singleton.

Configured browser API URLs require HTTPS with /api, or HTTP loopback for development. Credentials, query, fragment and other paths are rejected. Canonical production auth endpoint: https://calls-api.connectxmedia.com/api/auth. Shared secure cookies on connectxmedia.com are owned by backend configuration; cookies alone do not establish Twenty/Mautic SSO or authorize changes to unrelated apps.

The destination gate uses required && !verified, preserving the phoneRequired staff waiver. Relative redirects reject protocol-relative URLs, backslashes and control characters. English and Spanish labels and error messages are present; other locales inherit English through existing loadMessages deep merging. Credential failures and unavailable/configuration failures render distinct translated errors.

## Gates before live cutover

Mount and prove the backend principal endpoint, runtime, enrollment reconciliation and authorization guard. Migrate the listed consumers, protected layouts, password reset, verified-email/phone onboarding, organization membership operations, account blocks, realtime/extension credentials and lifecycle behavior together. Do not mount this dormant form alone, remove Clerk dependencies or open public signup.

Preserve LIFE-004 staff-approved closed signup, LIFE-005 temporary-password provisioning, staff verified-email allowlisting, Ringee UUID ownership and exact domain roles. Frontend permissions remain cosmetic; backend guards authorize every operation.

## Direct production imports

| File | Clerk references |
| --- | --- |
| `apps/frontend/src/app/(marketing)/page.tsx` | `import { auth } from '@clerk/nextjs/server';` |
| `apps/frontend/src/app/auth/sign-up/[[...sign-up]]/page.tsx` | `import { currentUser } from '@clerk/nextjs/server';` |
| `apps/frontend/src/app/auth/verify-phone/page.tsx` | `import { currentUser } from '@clerk/nextjs/server';` |
| `apps/frontend/src/app/backoffice/layout.tsx` | `import { currentUser } from '@clerk/nextjs/server';` |
| `apps/frontend/src/app/cli/layout.tsx` | `import { currentUser } from '@clerk/nextjs/server';` |
| `apps/frontend/src/app/dashboard/layout.tsx` | `import { currentUser } from '@clerk/nextjs/server';` |
| `apps/frontend/src/app/dashboard/page.tsx` | `import { auth } from '@clerk/nextjs/server';` |
| `apps/frontend/src/app/dashboard/settings/page.tsx` | `import { auth } from '@clerk/nextjs/server';` |
| `apps/frontend/src/app/infra/layout.tsx` | `import { currentUser } from '@clerk/nextjs/server';` |
| `apps/frontend/src/components/layout/app-sidebar.tsx` | `import { useUser, useOrganization } from '@clerk/nextjs';`; `import { SignOutButton } from '@clerk/nextjs';` |
| `apps/frontend/src/components/layout/clerk-app-provider.tsx` | `import { ClerkProvider } from '@clerk/nextjs';`; `import { ui } from '@clerk/ui';`; `import { dark } from '@clerk/ui/themes';` |
| `apps/frontend/src/components/layout/support-chat.tsx` | `import { useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/components/layout/user-nav.tsx` | `import { SignOutButton, useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/components/use-member-filter-column.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/agent-access/components/cli-authorize.tsx` | `import { useClerk, useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/features/ai/components/empty-state.tsx` | `import { useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/features/auth/components/sign-in-view.tsx` | `import { SignIn as ClerkSignInForm } from '@clerk/nextjs';` |
| `apps/frontend/src/features/auth/components/sign-up-view.tsx` | `import { SignUp as ClerkSignUpForm } from '@clerk/nextjs';` |
| `apps/frontend/src/features/auth/components/verify-phone-view.tsx` | `import { SignOutButton, useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/features/calls/components/call.page.view.tsx` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/calls/components/campaigns/unlock-campaigns-button.tsx` | `import { CreateOrganization, useOrganizationList } from '@clerk/nextjs';` |
| `apps/frontend/src/features/calls/hooks/use.call.campaigns.ts` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/calls/hooks/use.call.list.ts` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/calls/hooks/use.call.ts` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/calls/hooks/use.telnyx.tsx` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/campaigns/components/campaign-members-tab.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/credit/components/credit.popover.tsx` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/credit/components/funding/elements-checkout-panel.tsx` | `import { useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/features/credit/components/funding/monthly-setup-panel.tsx` | `import { useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/features/credit/components/funding/one-time-checkout.tsx` | `import { useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/features/dashboard/components/dashboard-filters.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/dialer/hooks/use-dialer-call.ts` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/external-carriers/components/external-carriers-panel.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/inbox/components/assign-thread-menu.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/infra/components/infra-canvas.tsx` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/infra/components/infra-context-switcher.tsx` | `import { useOrganization, useOrganizationList, useUser } from '@clerk/nextjs';` |
| `apps/frontend/src/features/infra/components/infra-topbar.tsx` | `import { UserButton } from '@clerk/nextjs';` |
| `apps/frontend/src/features/infra/components/usage/infra-usage.tsx` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/infra/lib/use-entities.ts` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/integrations/components/attio-dialer.tsx` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/integrations/components/odoo-connect-dialog.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/integrations/components/provider-catalog.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/number-rotation/hooks/use-number-rotation.ts` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/number-rotation/hooks/use-rotation-enabled.ts` | `import { useAuth } from '@clerk/nextjs';` |
| `apps/frontend/src/features/overview/components/dashboard-header.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/overview/components/member-selector.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/features/profile/components/profile-view-page.tsx` | `import { UserProfile } from '@clerk/nextjs';` |
| `apps/frontend/src/features/security/components/account-lockdown-provider.tsx` | `import { useClerk } from '@clerk/nextjs';` |
| `apps/frontend/src/features/security/components/concurrent-call-dialog.tsx` | `import { useOrganization } from '@clerk/nextjs';` |
| `apps/frontend/src/middleware.ts` | `import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';` |
| `packages/frontend-shared/src/components/org-switcher.tsx` | `import { useOrganization, useOrganizationList } from "@clerk/nextjs";`; `import { CreateOrganization, OrganizationProfile } from "@clerk/nextjs";` |
| `packages/frontend-shared/src/hooks/use-org-members.ts` | `import { useOrganization, useUser } from "@clerk/nextjs";` |
| `packages/frontend-shared/src/hooks/use-org-role.ts` | `import { useOrganization } from "@clerk/nextjs";` |
| `packages/frontend-shared/src/hooks/use.analytics.ts` | `import { useUser } from "@clerk/nextjs";` |
| `packages/frontend-shared/src/hooks/use.api.ts` | `import { useAuth } from "@clerk/nextjs";` |
| `packages/frontend-shared/src/lib/api.server.ts` | `import { auth } from "@clerk/nextjs/server";` |
| `packages/frontend-shared/src/realtime/use-user-events.ts` | `import { useAuth } from "@clerk/nextjs";` |

## Existing test reference

`apps/frontend/scripts/my-day-regressions.test.mjs` contains the existing Clerk test double. Update it with its consumers during cutover.

## Verification

Seven mocked SDK/HTTP tests passed: phone waiver/safe redirects; credential stripping/UUID/role validation; anonymous/expired versus unavailable principal responses; concurrent SSR cookie isolation/no-store; SDK endpoint/credential behavior; URL validation; error status preservation.

Strict changed-source TypeScript checking passed, including actual TSX/form dependencies with the shared package's ES5 target and classic node module resolution. Changed-source ESLint passed with zero errors and one unchanged upstream warning in ApiClient.maybeMock. The final reproducible runner passed, including all 12-file Prettier checks, changed-source ESLint, strict TypeScript checks and all seven tests. Full frontend build and live-consumer cutover remain CI/release gates.
