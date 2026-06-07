import { verifySession } from "@/lib/session";
import { HomeContent } from "@/components/HomeContent";

export default async function Home() {
  const { email } = await verifySession();
  return <HomeContent userEmail={email} />;
}
