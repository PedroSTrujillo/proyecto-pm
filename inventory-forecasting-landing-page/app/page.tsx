import { SiteHeader } from '@/components/landing/site-header'
import { Hero } from '@/components/landing/hero'
import { ProblemSection } from '@/components/landing/problem-section'
import { HowItWorks } from '@/components/landing/how-it-works'
import { MethodSection } from '@/components/landing/method-section'
import { CalculatorSection } from '@/components/landing/calculator-section'
import { EquipoSection } from '@/components/landing/equipo-section'
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
        <EquipoSection />
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <CtaEnLinea className="rounded-2xl border border-border bg-card p-6 md:p-8" texto="¿Quiere verlo con sus productos?" />
        </div>
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  )
}
