import { describe, expect, it } from 'vitest'
import { hasVerifiedPhone } from './auth'

describe('hasVerifiedPhone', () => {
  it('returns false when user is missing', () => {
    expect(hasVerifiedPhone(null)).toBe(false)
    expect(hasVerifiedPhone(undefined)).toBe(false)
  })

  it('returns false when there are no verified phone numbers', () => {
    expect(
      hasVerifiedPhone({
        phoneNumbers: [{ verification: { status: 'unverified' } }],
      }),
    ).toBe(false)
  })

  it('returns true when at least one phone number is verified', () => {
    expect(
      hasVerifiedPhone({
        phoneNumbers: [
          { verification: { status: 'unverified' } },
          { verification: { status: 'verified' } },
        ],
      }),
    ).toBe(true)
  })
})
