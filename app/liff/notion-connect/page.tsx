import NotionConnectClient from "./notion-connect-client";

export default async function LiffNotionConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  const params = await searchParams;
  const raw = params.auth || "";
  let authUrl = "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:") {
      authUrl = parsed.toString();
    }
  } catch {
    authUrl = "";
  }

  return <NotionConnectClient authUrl={authUrl} />;
}
