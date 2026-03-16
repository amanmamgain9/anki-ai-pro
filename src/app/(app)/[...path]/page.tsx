"use client";

import { useAppRouter } from "@/lib/app-router";
import CardsView from "@/views/CardsView";
import NewCardView from "@/views/NewCardView";
import DecksView from "@/views/DecksView";
import NewDeckView from "@/views/NewDeckView";
import StudyView from "@/views/StudyView";
import BulkUploadView from "@/views/BulkUploadView";
import SettingsView from "@/views/SettingsView";
import GenerateCardsView from "@/views/GenerateCardsView";
import BillingStartView from "@/views/BillingStartView";

export default function AppCatchAll() {
  const { pathname } = useAppRouter();

  if (pathname === "/cards/bulk" || pathname.startsWith("/cards/bulk?")) return <BulkUploadView />;
  if (pathname === "/cards/generate" || pathname.startsWith("/cards/generate?")) return <GenerateCardsView />;
  if (pathname === "/cards/new" || pathname.startsWith("/cards/new?")) return <NewCardView />;
  if (pathname === "/decks/new" || pathname.startsWith("/decks/new?")) return <NewDeckView />;
  if (pathname === "/study" || pathname.startsWith("/study?")) {
    const deckKey = new URLSearchParams(window.location.search).get("deck") || "picker";
    return <StudyView key={deckKey} />;
  }
  if (pathname === "/decks" || pathname.startsWith("/decks?")) return <DecksView />;
  if (pathname === "/start-trial" || pathname.startsWith("/start-trial?")) return <BillingStartView />;
  if (pathname === "/settings") return <SettingsView />;

  return <CardsView />;
}
