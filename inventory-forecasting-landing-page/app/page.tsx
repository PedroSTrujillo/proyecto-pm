import { SiteHeader } from '@/components/landing/site-header'
import { Hero } from '@/components/landing/hero'
import { ProblemSection } from '@/components/landing/problem-section'
import { HowItWorks } from '@/components/landing/how-it-works'
import { MethodSection } from '@/components/landing/method-section'
import { DiscountSection } from '@/components/landing/discount-section'
import { ResultsSection } from '@/components/landing/results-section'
import { AudienceSection } from '@/components/landing/audience-section'
import { PricingSection } from '@/components/landing/pricing-section'
import { FaqSection } from '@/components/landing/faq-section'
import { CtaSection } from '@/components/landing/cta-section'
import { SiteFooter } from '@/components/landing/site-footer'

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <ProblemSection />
        <HowItWorks />
        <MethodSection />
        <DiscountSection />
        <ResultsSection />
        <AudienceSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  )
}
