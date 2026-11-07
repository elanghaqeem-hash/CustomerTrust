// Explicit opt-in: LMS remains unavailable on every environment by default.
// NEXT_PUBLIC is intentionally shared between the client-side navigation and server routes.
export const LMS_ENABLED = process.env.NEXT_PUBLIC_TRAINLIVE_LMS_ENABLED === 'true';
