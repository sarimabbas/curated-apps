import {
  SignedIn,
  SignInButton,
  SignedOut,
  UserButton,
} from '@clerk/clerk-react'

export default function HeaderUser() {
  return (
    <>
      <SignedIn>
        <UserButton />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-strong)] transition hover:-translate-y-0.5"
          >
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
    </>
  )
}
