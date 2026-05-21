import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Lock, Search } from "lucide-react";
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
  errorComponent: SharedTranscriptError,
});

function SharedTranscriptError({ error }: { error: Error }) {
  const { sessionId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const callbackUrl = `/s/${sessionId}`;
  const requiresLogin = !session && error.message === "Login required";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-4 py-12">
      <div className="relative w-full overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-2xl shadow-black/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.16),transparent_42%)]" />
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_58%)] lg:block" />
        <div className="relative p-8 sm:p-12">
          <Badge variant="outline" className="mb-5 border-primary/30 bg-primary/10 text-primary">
            {requiresLogin ? "Shared Transcript" : "Transcript Link"}
          </Badge>

          <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <Lock className="size-8" />
          </div>

          <h1 className="max-w-lg font-display text-3xl tracking-tight text-white sm:text-5xl">
            {requiresLogin ? "Sign In to See What Was Shared" : "This Transcript Is Not Available"}
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-pretty text-white/65 sm:text-lg">
            {requiresLogin
              ? "Someone shared a transcript with you, but AgentLogs only reveals shared logs to signed-in users. Log in to check whether this transcript is available through your account or team."
              : "That link is missing, expired, or no longer shared with your account. If you expected access, ask the owner to send a fresh link or adjust the transcript visibility."}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {requiresLogin ? (
              <Button asChild size="lg" className="h-11 min-w-52">
                <a href={`/auth/login?callbackURL=${encodeURIComponent(callbackUrl)}`}>
                  Continue to Sign In
                  <ArrowRight className="ml-2 size-4" />
                </a>
              </Button>
            ) : null}

            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 min-w-44 border-white/15 bg-white/5 hover:bg-white/10"
            >
              <a href={session ? "/app" : "/"}>
                <Search className="mr-2 size-4" />
                {session ? "Back to App" : "Back to Home"}
              </a>
            </Button>
          </div>

          {requiresLogin ? (
            <p className="mt-8 text-sm text-white/40">
              If you were expecting access, ask the owner to confirm the transcript is still shared with you.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
