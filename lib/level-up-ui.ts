/** Shared Tailwind class bundles for Level Up Install surfaces. */

export function luSectionTab(active: boolean): string {
  return `lu-tab ${active ? "lu-tab-active" : "lu-tab-inactive"}`;
}

export const lu = {
  page: "lu-page",
  container: "lu-container",
  nav: "lu-nav",
  navInner: "lu-nav-inner",
  navMenu: "lu-nav-menu",
  navMenuItem: "lu-nav-menu-item",
  tabsBar: "lu-tabs-bar",
  card: "lu-card",
  panel: "lu-panel",
  panelInset: "lu-panel-inset",
  eyebrow: "lu-eyebrow",
  heading: "lu-heading",
  headingLg: "lu-heading-lg",
  body: "lu-body",
  muted: "lu-muted",
  btn: "lu-btn",
  btnPrimary: "lu-btn-primary",
  btnSecondary: "lu-btn-secondary",
  btnGhost: "lu-btn-ghost",
  btnSuccess: "lu-btn-success",
  input: "lu-input",
  textarea: "lu-textarea",
  label: "lu-label",
  alertSuccess: "lu-alert-success",
  alertError: "lu-alert-error",
  chatScroll: "lu-chat-scroll",
  chatAssistant: "lu-chat-bubble-assistant",
  chatUser: "lu-chat-bubble-user",
  photoZone: "lu-photo-zone",
  featureTile: "lu-feature-tile",
  bullet: "lu-bullet",
} as const;

export function adminTab(active: boolean): string {
  return active ? "admin-tab-active" : "admin-tab-inactive";
}
