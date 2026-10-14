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
import { RedireccionHash } from '@/components/landing/redireccion-hash'
import { CtaEnLinea } from '@/components/landing/cta-en-linea'

export default function Page() {
  return (
    <>
      <RedireccionHash />
      <SiteHeader />
      <main>
        <Hero />
        <ProblemSection />
        <AudienceSection />
        <HowItWorks />
        <MethodSection />
        <CalculatorSection />
        <ComparisonSection />
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <CtaEnLinea className="rounded-2xl border border-border bg-card p-6 md:p-8" texto="¿Quieres verlo con tus productos?" />
        </div>
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  )
}
