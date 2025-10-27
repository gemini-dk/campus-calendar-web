import { permanentRedirect } from "next/navigation";

const DEFAULT_FISCAL_YEAR = "2025";

type PageProps = {
  params: { webId: string };
};

export default async function Page({ params }: PageProps) {
  const { webId } = params;
  permanentRedirect(`/${encodeURIComponent(webId)}/calendar/${DEFAULT_FISCAL_YEAR}`);
}
