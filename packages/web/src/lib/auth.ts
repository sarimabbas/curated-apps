export type PhoneVerificationStatus =
  | 'verified'
  | 'unverified'
  | 'transferable'
  | string
  | null

export type PhoneNumberLike = {
  verification?: {
    status?: PhoneVerificationStatus
  }
}

export type UserLike = {
  phoneNumbers?: PhoneNumberLike[]
}

export function hasVerifiedPhone(user: UserLike | null | undefined): boolean {
  const phoneNumbers = user?.phoneNumbers ?? []
  return phoneNumbers.some((phone) => phone.verification?.status === 'verified')
}
