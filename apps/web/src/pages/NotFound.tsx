import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import RedesignHeader from "@/redesign/components/RedesignHeader";
import FooterSection from "@/components/FooterSection";

/** 404 в общем шаблоне: шапка, нижнее меню и подвал — чтобы с ошибочного адреса было куда уйти */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <RedesignHeader />
      <main className="container-page flex flex-1 items-center justify-center py-16 lg:py-24">
        <div className="max-w-md text-center">
          <p className="text-5xl font-bold text-primary/80">404</p>
          <h1 className="mt-3 text-xl font-semibold text-foreground">Страница не найдена</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Возможно, адрес набран с ошибкой или объект больше не опубликован.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/catalog"
              className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              В каталог
            </Link>
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-xl border border-border px-5 text-sm font-medium hover:bg-muted/50"
            >
              На главную
            </Link>
          </div>
        </div>
      </main>
      <FooterSection reserveMobileNav />
    </div>
  );
};

export default NotFound;
