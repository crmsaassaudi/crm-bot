import type { GetServerSideProps } from "next";
import { SignInPage } from "@/features/auth/components/SignInPage";

export const getServerSideProps = (async () => {
  if (process.env.CRM_BOT_SSO_LOCKDOWN === "true")
    return {
      redirect: {
        destination: "/signin",
        permanent: false,
      },
    };

  return { props: {} };
}) satisfies GetServerSideProps;

export default function Page() {
  return <SignInPage type="signup" />;
}
