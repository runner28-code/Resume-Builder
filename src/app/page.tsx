import { verifySession } from "@/lib/session";
import { HomeContent } from "@/components/HomeContent";

export default async function Home() {
  const { userId, email } = await verifySession();
  return <HomeContent userId={userId} userEmail={email} />;
}
