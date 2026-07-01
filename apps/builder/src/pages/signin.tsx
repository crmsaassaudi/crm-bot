import { SignInPage } from "@/features/auth/components/SignInPage";
import { signIn } from "next-auth/react";
import { useEffect } from "react";

export default function Page() {
  const isSsoLockdown =
    process.env.NEXT_PUBLIC_CRM_BOT_SSO_LOCKDOWN === "true";

  useEffect(() => {
    if (isSsoLockdown) {
      // Auto-redirect to Keycloak immediately — no button click needed.
      // If the user already has a Keycloak SSO session (from the main CRM app),
      // Keycloak will skip the login form and redirect back here instantly.
      signIn("keycloak");
    }
  }, [isSsoLockdown]);

  if (isSsoLockdown) {
    // Show a minimal loading state while redirecting to Keycloak
    return (
      <div
        style={{
          display: "flex",
          height: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          color: "#6b7280",
          fontSize: "14px",
          gap: "10px",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ animation: "spin 1s linear infinite" }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        Đang chuyển hướng đăng nhập...
      </div>
    );
  }

  return <SignInPage type="signin" />;
}
