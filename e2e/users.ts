// Clerk development instances accept "+clerk_test" addresses without real email delivery.
// The host address must be listed in HOST_EMAILS in .env.local.
export const E2E_USERS = {
  host: { email: "host+clerk_test@example.com", firstName: "Host" },
  owner: { email: "owner+clerk_test@example.com", firstName: "Owner" },
  student: { email: "student+clerk_test@example.com", firstName: "Student" },
} as const;
