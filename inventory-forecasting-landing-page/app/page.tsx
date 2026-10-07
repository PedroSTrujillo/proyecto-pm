import { SiteHeader } from '@/components/landing/site-header'
import { Hero } from '@/components/landing/hero'
import { ProblemSection } from '@/components/landing/problem-section'
import { HowItWorks } from '@/components/landing/how-it-works'
import { MethodSection } from '@/components/landing/method-section'
import { CalculatorSection } from '@/components/landing/calculator-section'
import { ComparisonSection } from '@/components/landing/comparison-section'
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
        <CalculatorSection />
        <ComparisonSection />
        <AudienceSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  )
}
