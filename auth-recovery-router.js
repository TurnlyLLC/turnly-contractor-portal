(function () {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const tokenType = String(searchParams.get("type") || hashParams.get("type") || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const hasRecoveryToken = tokenType === "recovery" && (
    searchParams.has("code") ||
    searchParams.has("token_hash") ||
    hashParams.has("token_hash") ||
    (hashParams.has("access_token") && hashParams.has("refresh_token"))
  );

  if (!hasRecoveryToken) return;

  const path = window.location.pathname.toLowerCase();
  if (path.endsWith("/reset-password.html")) return;

  const portalFromPath = path.includes("property-manager")
    ? "property_manager"
    : "contractor";
  const portal = searchParams.get("portal") ||
    hashParams.get("portal") ||
    window.localStorage?.getItem("turnly_reset_portal") ||
    portalFromPath;
  const target = new URL("/reset-password.html", window.location.origin);
  target.search = window.location.search;
  target.searchParams.set("portal", portal);
  target.hash = window.location.hash;
  window.location.replace(target.toString());
})();
