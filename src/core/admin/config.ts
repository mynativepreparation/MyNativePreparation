// Where the course content lives (DECISIONS Q24). The editor reads and (in P11) writes here.
// Only the owner of this repo, and people the owner adds as collaborators, can pass the editor login.
export const CONTENT_REPO = {
  owner: 'mynativepreparation',
  name: 'MyNativePreparation',
  // Assumed default branch; the GitHub client (P10 T4) checks it against the API.
  branch: 'main',
} as const;

// Largest image the editor keeps, in bytes (about 500 KB, DECISIONS Q24). Bigger images are shrunk in the browser.
export const MAX_IMAGE_BYTES = 500 * 1024;
