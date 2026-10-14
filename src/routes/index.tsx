import { createFileRoute } from "@tanstack/react-router";
import { CallFlowGame } from "@/components/call-flow-game";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <CallFlowGame />;
}
