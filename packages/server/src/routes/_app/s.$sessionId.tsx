import { createFileRoute } from "@tanstack/react-router";
import { getTranscript } from "../../lib/server-functions";
import { buildTranscriptHead, TranscriptDetailComponent, TranscriptPendingComponent } from "./app/logs.$id";

export const Route = createFileRoute("/_app/s/$sessionId")({
  loader: ({ params }) => getTranscript({ data: params.sessionId }),
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  pendingComponent: TranscriptPendingComponent,
  pendingMinMs: 100,
  component: () => <TranscriptDetailComponent data={Route.useLoaderData()} />,
  head: ({ loaderData }) => buildTranscriptHead(loaderData, "s"),
});
