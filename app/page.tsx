import { redirect } from "next/navigation";

// Root entry: send everyone into the app shell. /dashboard's (app) layout runs
// the session check and bounces unauthenticated users to /login.
export default function Home() {
  redirect("/dashboard");
}
