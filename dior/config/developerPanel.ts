// xoxo/config/developerPanel.ts
//
// All content shown by the $developer command.
// Edit these fields to update the panel without touching command logic.

export const developerPanelConfig = {

  // ── Developer identity ───────────────────────────────────────────────────────
  name:       'Reyansh',
  /** Discord user ID — used for the in-panel mention. */
  userId:     '922491166149214218',
  /** Short bio shown under the name. */
  about:      '16 yo stupid programmer.',
  /** Developer avatar — used as the section thumbnail. */
  avatarUrl:  'https://i.ibb.co/NnyxGwgY/square-crop-3.jpg',
  /** Optional banner/header image shown at the top of the panel.
   *  Set to '' to skip the image. */
  bannerUrl:  'https://i.ibb.co/JbR67st/81eb1f7bada595956538d06a5026f094.jpg',

  // ── Bot project info ─────────────────────────────────────────────────────────
  project: 'Cassie',
  year:    '2026',
  status:  'Active',
  reason:  'Developer was bored',

  // ── Connect buttons ──────────────────────────────────────────────────────────
  /** Links to the developer's Discord profile (shows Add Friend option). */
  addFriendUrl:     'https://discord.com/users/922491166149214218',

} as const;
