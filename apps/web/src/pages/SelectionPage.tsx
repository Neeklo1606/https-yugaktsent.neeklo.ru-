import RedesignHeader from '@/redesign/components/RedesignHeader';
import QuizSection from '@/components/QuizSection';
import FooterSection from '@/components/FooterSection';

export default function SelectionPage() {
  return (
    <div className="min-h-screen bg-background">
      <RedesignHeader />
      <div className="max-w-[1400px] mx-auto px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold tracking-tight">Подбор объекта</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ответьте на несколько вопросов, и мы подберём варианты и свяжемся с вами
        </p>
      </div>
      <QuizSection />
      <FooterSection reserveMobileNav />
    </div>
  );
}
