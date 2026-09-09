import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { MobileBottomBar } from "@/components/site/mobile-bottom-bar";
import { StickyCtaSlot } from "@/components/site/sticky-cta-slot";

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Header />
      {/* Bottom padding clears the sticky mobile bar so it never covers the
          last element on the page. */}
      <main id="main" className="pb-20 lg:pb-0">
        {children}
      </main>
      <Footer />
      <StickyCtaSlot>
        <MobileBottomBar />
      </StickyCtaSlot>
    </>
  );
}
